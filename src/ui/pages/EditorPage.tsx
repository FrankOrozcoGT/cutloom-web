import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { TARGET_SAMPLE_RATE } from '@domain/shorts'
import type { Subtitles } from '@domain/subtitles'
import { detectSilenceCuts } from '@domain/timeline'
import type { VideoAsset, VideoUploadResult } from '@domain/video'
import { CollapsibleSection } from '@ui/components/CollapsibleSection'
import { CreateShortsTool } from '@ui/components/CreateShortsTool'
import { ImproveSubtitlesTool } from '@ui/components/ImproveSubtitlesTool'
import { SubtitlePanel } from '@ui/components/SubtitlePanel'
import { SubtitleSegmentList } from '@ui/components/SubtitleSegmentList'
import { VideoListItem } from '@ui/components/VideoListItem'
import { VideoUploader } from '@ui/components/VideoUploader'
import { Timeline, type RemovedSegmentChip } from '@ui/timeline/Timeline'
import { TimelinePlayer } from '@ui/timeline/TimelinePlayer'
import { useTimeline } from '@ui/timeline/useTimeline'
import { useAuth } from '@ui/auth/useAuth'
import { useShorts } from '@ui/hooks/useShorts'
import { useSubtitles } from '@ui/hooks/useSubtitles'
import { extractSubtitlesAudioUseCase } from '@ui/shorts/composition'
import { videoStorage, projectUseCase } from '@ui/video/composition'

function videosSectionTitle(assetCount: number): string {
  return assetCount > 0 ? `Videos (${assetCount})` : 'Videos'
}

// Los chips de silencios quitados se persisten por proyecto en localStorage
// para sobrevivir recargas — el corte en sí ya vive en el timeline guardado;
// esto conserva solo el registro reversible (la X de cada chip).
function removedChipsKey(projectId: string): string {
  return `cutloom:removed-silences:${projectId}`
}

function loadRemovedChips(projectId: string): RemovedSegmentChip[] {
  try {
    const raw = localStorage.getItem(removedChipsKey(projectId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((chip): chip is RemovedSegmentChip => {
      const candidate = chip as RemovedSegmentChip | null
      return (
        !!candidate &&
        Number.isFinite(candidate.displayOffsetMs) &&
        !!candidate.segment?.clip &&
        typeof candidate.segment.trackId === 'string'
      )
    })
  } catch {
    return []
  }
}

/** Cada corte nuevo desplaza hacia la izquierda todo lo que quedó después de él en el timeline previo al lote — mismo sistema de coordenadas en el que ya están los displayOffsetMs de los chips existentes. */
function shiftChipsForNewCuts(
  previousChips: RemovedSegmentChip[],
  newCuts: { atMs: number; durationMs: number }[],
): RemovedSegmentChip[] {
  return previousChips.map((chip) => {
    const shiftMs = newCuts
      .filter((cut) => cut.atMs <= chip.displayOffsetMs)
      .reduce((total, cut) => total + cut.durationMs, 0)
    return shiftMs > 0 ? { ...chip, displayOffsetMs: chip.displayOffsetMs - shiftMs } : chip
  })
}

/** Reinsertar un tramo empuja hacia la derecha lo que quedó después de su posición — los chips posteriores se recorren. */
function shiftChipsForReinsertion(
  remainingChips: RemovedSegmentChip[],
  reinsertedAtMs: number,
  reinsertedDurationMs: number,
): RemovedSegmentChip[] {
  return remainingChips.map((chip) =>
    chip.displayOffsetMs >= reinsertedAtMs
      ? { ...chip, displayOffsetMs: chip.displayOffsetMs + reinsertedDurationMs }
      : chip,
  )
}

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, Blob>>({})
  const [projectName, setProjectName] = useState('')
  const [segmentsVisible, setSegmentsVisible] = useState(false)
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [removedChips, setRemovedChips] = useState<RemovedSegmentChip[]>(() =>
    projectId ? loadRemovedChips(projectId) : [],
  )
  const [isDetectingSilence, setIsDetectingSilence] = useState(false)
  const [silenceThresholdDb, setSilenceThresholdDb] = useState(-40)
  const [silencePaddingMs, setSilencePaddingMs] = useState(1000)
  // Texto original de cada segmento mejorado por IA, en memoria (no
  // persiste): mientras un segmento tenga entrada acá, la lista de
  // segmentos muestra el diff (tachado en rojo + texto nuevo en verde) en
  // vez del texto plano, y el usuario puede revertirlo puntualmente.
  const [pendingSubtitleDiffs, setPendingSubtitleDiffs] = useState<Record<string, string>>({})

  const { hasActiveFeature } = useAuth()
  const hasShortsAccess = hasActiveFeature('shorts_ai')

  const subtitlesState = useSubtitles(projectId ?? '')
  const shortsState = useShorts()

  // useTimeline necesita leer/restaurar subtítulos para el historial combinado
  // sin depender del objeto subtitlesState completo (cambia de identidad en
  // cada render) — un ref siempre actualizado evita recrear el bridge y, con
  // él, reiniciar el historial de undo/redo en cada re-render.
  const subtitlesRef = useRef(subtitlesState)
  subtitlesRef.current = subtitlesState
  const subtitlesBridge = useMemo(
    () => ({
      get: () => subtitlesRef.current.subtitles,
      restore: (subtitles: Subtitles | null) => {
        void subtitlesRef.current.restore(subtitles)
      },
    }),
    [],
  )

  // Los chips de tramos quitados viajan dentro del historial del timeline
  // (sus offsets solo corresponden al timeline en el que se detectaron) — el
  // bridge expone el estado actual y restaura snapshots en undo/redo/vaciar
  // sin depender de la identidad de removedChips en cada render.
  const removedChipsRef = useRef(removedChips)
  removedChipsRef.current = removedChips
  const removedChipsBridge = useMemo(
    () => ({
      get: () => removedChipsRef.current,
      restore: (chips: RemovedSegmentChip[]) => setRemovedChips(chips),
    }),
    [],
  )

  const timelineState = useTimeline(projectId ?? '', subtitlesBridge, removedChipsBridge)

  // Al cambiar de proyecto sin desmontar la página se recargan los chips del
  // proyecto entrante.
  const previousProjectRef = useRef(projectId)
  const skipNextSaveRef = useRef(false)
  useEffect(() => {
    if (previousProjectRef.current === projectId) return
    previousProjectRef.current = projectId
    // El efecto de guardado corre en este mismo commit con los chips del
    // proyecto saliente — se salta una vez para no pisar la llave nueva.
    skipNextSaveRef.current = true
    setRemovedChips(projectId ? loadRemovedChips(projectId) : [])
  }, [projectId])

  // Guarda los chips en cada cambio — también cuando se limpian (undo, redo o
  // vaciar el timeline), para que el registro persistido no resucite cortes
  // que el usuario ya deshizo.
  useEffect(() => {
    if (!projectId) return
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    try {
      localStorage.setItem(removedChipsKey(projectId), JSON.stringify(removedChips))
    } catch {
      // localStorage lleno o no disponible — los chips siguen funcionando en memoria.
    }
  }, [projectId, removedChips])

  const loadAssets = useCallback(async () => {
    if (!projectId) return
    const stored = await videoStorage.getByProject(projectId)
    setAssets(stored)
  }, [projectId])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

  useEffect(() => {
    if (!projectId) return
    void projectUseCase.getAll().then((projects) => {
      const project = projects.find((p) => p.id === projectId)
      setProjectName(project?.name ?? projectId)
    })
  }, [projectId])

  const handleUploaded = useCallback(
    (results: VideoUploadResult[]) => {
      setThumbnails((previous) => {
        const next = { ...previous }
        for (const result of results) {
          next[result.asset.id] = result.thumbnail
        }
        return next
      })
      void loadAssets()
    },
    [loadAssets],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await videoStorage.delete(id)
      await timelineState.removeClipsByAsset(id)
      setAssets((previous) => previous.filter((asset) => asset.id !== id))
    },
    [timelineState],
  )

  const assetsById = useMemo(
    () => Object.fromEntries(assets.map((asset) => [asset.id, asset])),
    [assets],
  )

  const [fitTrigger, setFitTrigger] = useState<number>()

  const handleGenerateSubtitles = useCallback(async () => {
    setFitTrigger((previous) => (previous ?? 0) + 1)
    await subtitlesState.generate()
  }, [subtitlesState])

  const handleToggleSegments = useCallback(() => {
    setSegmentsVisible((previous) => !previous)
  }, [])

  const handleSegmentClick = useCallback((segmentId: string) => {
    setActiveSegmentId(segmentId)
    setSegmentsVisible(true)
  }, [])

  const handleSeek = useCallback(
    (startMs: number) => {
      timelineState.setPlayheadMs(startMs)
    },
    [timelineState],
  )

  const handleEditSegmentText = useCallback(
    (segmentId: string, text: string) => {
      void subtitlesState.editText(segmentId, text)
      // Editar a mano mientras hay un diff pendiente de la mejora de IA
      // significa que el usuario ya tomó control del texto — seguir
      // comparando contra la versión de la IA (y ofreciendo "revertir" a
      // ella) perdería justo esa edición manual.
      setPendingSubtitleDiffs((previous) => {
        if (!(segmentId in previous)) return previous
        const next = { ...previous }
        delete next[segmentId]
        return next
      })
    },
    [subtitlesState],
  )

  const handleEditSegmentTiming = useCallback(
    (segmentId: string, startMs: number, endMs: number) => {
      void subtitlesState.editTiming(segmentId, startMs, endMs)
    },
    [subtitlesState],
  )

  const handleImproveSubtitles = useCallback(
    (userContext?: string) => {
      if (!projectId || !subtitlesState.subtitles) return
      void shortsState.improveSubtitles(subtitlesState.subtitles.segments, userContext)
    },
    [projectId, subtitlesState.subtitles, shortsState],
  )

  // Al llegar la mejora de IA se aplica de una (todos los segmentos quedan
  // aceptados por defecto, igual que los cortes de silencio) — el texto
  // original de cada uno se guarda acá para poder mostrar el diff y
  // revertirlo puntualmente. No corre de nuevo mientras improvedSubtitles no
  // cambie de identidad (una sola vez por resultado de mejora).
  const appliedImprovementRef = useRef<typeof shortsState.improvedSubtitles | null>(null)
  useEffect(() => {
    if (shortsState.improveState !== 'success') return
    if (shortsState.improvedSubtitles.length === 0) return
    if (appliedImprovementRef.current === shortsState.improvedSubtitles) return
    appliedImprovementRef.current = shortsState.improvedSubtitles
    if (!subtitlesState.subtitles) return

    const diffs: Record<string, string> = {}
    const changes: { segmentId: string; text: string }[] = []
    for (const improved of shortsState.improvedSubtitles) {
      const segment = subtitlesState.subtitles.segments.find(
        (s) => s.startMs === improved.startMs && s.endMs === improved.endMs,
      )
      if (!segment) continue
      // Compara sin espacios/mayúsculas irrelevantes: si el LLM solo
      // normalizó whitespace o capitalización sin cambiar palabras, no vale
      // la pena mostrar el diff ni el botón de revertir para "nada".
      if (segment.text.trim().toLowerCase() !== improved.corrected.trim().toLowerCase()) {
        diffs[segment.id] = segment.text
        changes.push({ segmentId: segment.id, text: improved.corrected })
      }
    }
    // Un solo editMultipleTexts en vez de un editText por segmento: cada
    // editText parte del `subtitles` capturado en su propio closure, así
    // que llamarlo en loop pisa los cambios anteriores del mismo lote entre
    // sí — solo el último realmente quedaba aplicado.
    if (changes.length > 0) {
      void subtitlesState.editMultipleTexts(changes)
    }
    setPendingSubtitleDiffs((previous) => ({ ...previous, ...diffs }))
  }, [shortsState.improveState, shortsState.improvedSubtitles, subtitlesState])

  // El resumen del video (dominio de proyecto, no de subtítulos) se guarda
  // como descripción del proyecto — se ve y edita desde el listado de
  // proyectos, no acá en el editor. Efecto separado del de arriba: son dos
  // datos independientes de la misma respuesta de mejora, cada uno dueño de
  // su propio disparador de "una sola vez por resultado".
  const appliedSummaryRef = useRef<string | null>(null)
  useEffect(() => {
    if (shortsState.improveState !== 'success') return
    if (!shortsState.improveSummary || !projectId) return
    if (appliedSummaryRef.current === shortsState.improveSummary) return
    appliedSummaryRef.current = shortsState.improveSummary
    void projectUseCase.updateDescription(projectId, shortsState.improveSummary).then((result) => {
      if (!result.ok) console.error('No se pudo guardar el resumen del proyecto:', result.error)
    })
  }, [shortsState.improveState, shortsState.improveSummary, projectId])

  const handleRevertImprovedSegment = useCallback(
    (segmentId: string) => {
      const original = pendingSubtitleDiffs[segmentId]
      if (original === undefined) return
      void subtitlesState.editText(segmentId, original)
      setPendingSubtitleDiffs((previous) => {
        const next = { ...previous }
        delete next[segmentId]
        return next
      })
    },
    [pendingSubtitleDiffs, subtitlesState],
  )

  const handleCreateShorts = useCallback(
    (ideal?: string) => {
      if (!projectId || !subtitlesState.subtitles) return
      void shortsState.createShorts(projectId, subtitlesState.subtitles.segments, ideal)
    },
    [projectId, subtitlesState.subtitles, shortsState],
  )

  // Detecta silencio real analizando el volumen del audio del timeline (RMS
  // por ventana bajo un umbral), igual que Descript/AutoCut/Premiere — no
  // depende de que existan subtítulos, que eran solo un proxy indirecto e
  // impreciso (Whisper puede fusionar pausas cortas dentro de un segmento, o
  // no transcribir bien un tramo con ruido que no es silencio real).
  //
  // Todos los huecos detectados se eliminan como un solo paso de historial:
  // removeSegments (dominio) resuelve el lote completo sobre el timeline en
  // memoria y acá solo se aplica una vez con applyNewTimeline — un Ctrl+Z
  // deshace los N cortes juntos, no de a uno. Revertir un silencio puntual
  // después (la X) es una acción nueva e independiente con su propio paso de
  // historial vía reinsertSegment — no hace falta deshacer el lote para eso.
  const handleDetectSilence = useCallback(async () => {
    if (!projectId) return
    setIsDetectingSilence(true)
    const audioResult = await extractSubtitlesAudioUseCase.execute(projectId)
    if (audioResult.ok) {
      const cuts = detectSilenceCuts(audioResult.value, TARGET_SAMPLE_RATE, {
        thresholdDb: silenceThresholdDb,
        paddingMs: silencePaddingMs,
      }).sort((a, b) => b.startMs - a.startMs)
      // Se calcula acá y se pasa a removeSegments para que timeline + chips
      // nuevos se apliquen como un solo paso de historial (applyNewTimeline
      // restaura ambos juntos) — antes quedaban en dos setState separados y
      // undo/redo los deshacía en pasos distintos, desincronizando timeline y
      // pills.
      await timelineState.removeSegments(cuts, (removed) => {
        const ascending = [...removed].reverse()
        const newChips: RemovedSegmentChip[] = []
        let removedBeforeMs = 0
        for (const r of ascending) {
          newChips.push({ segment: r, displayOffsetMs: r.clip.offsetMs - removedBeforeMs })
          removedBeforeMs += r.clip.durationMs
        }
        const shiftedPrevious = shiftChipsForNewCuts(
          removedChipsRef.current,
          ascending.map((r) => ({ atMs: r.clip.offsetMs, durationMs: r.clip.durationMs })),
        )
        return [...shiftedPrevious, ...newChips].sort((a, b) => a.displayOffsetMs - b.displayOffsetMs)
      })
    }
    setIsDetectingSilence(false)
  }, [projectId, timelineState, silenceThresholdDb, silencePaddingMs])

  const handleRestoreChip = useCallback(
    async (index: number) => {
      const chip = removedChips[index]
      if (!chip) return
      // Igual que en handleDetectSilence: los chips restantes se calculan acá
      // y se pasan a reinsertSegment para que timeline + chips se apliquen
      // como un solo paso de historial, no dos setState separados que
      // undo/redo desincronizaría en pasos distintos.
      const nextRemovedChips = shiftChipsForReinsertion(
        removedChips.filter((_, i) => i !== index),
        chip.displayOffsetMs,
        chip.segment.clip.durationMs,
      )
      await timelineState.reinsertSegment(chip.segment, chip.displayOffsetMs, nextRemovedChips)
    },
    [removedChips, timelineState],
  )

  if (!projectId) {
    return null
  }

  const subtitlesProgressUntilMs = subtitlesState.state === 'transcribing' ? subtitlesState.processedUntilMs : null
  const activeSubtitleSegment = subtitlesState.subtitles?.segments.find((segment) => segment.id === activeSegmentId) ?? null
  const activeSubtitleRangeMs = activeSubtitleSegment
    ? { startMs: activeSubtitleSegment.startMs, endMs: activeSubtitleSegment.endMs }
    : null

  return (
    <div className="mx-auto flex h-full max-w-[1600px] min-w-0 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <div className="flex min-h-0 flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          {timelineState.timeline ? (
            <TimelinePlayer
              timeline={timelineState.timeline}
              assets={assetsById}
              playheadMs={timelineState.playheadMs}
              isPlaying={timelineState.isPlaying}
              onPlayheadChange={timelineState.setPlayheadMs}
              onPlayingChange={timelineState.setIsPlaying}
              segments={subtitlesState.subtitles?.segments}
              onActiveSegmentChange={setActiveSegmentId}
              onSegmentClick={handleSegmentClick}
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-border bg-bg text-sm text-text-muted">
              Cargando timeline…
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto lg:w-80 lg:shrink-0">
          <CollapsibleSection title={videosSectionTitle(assets.length)} defaultOpen>
            <VideoUploader projectId={projectId} onUploaded={handleUploaded} />
            {assets.map((asset) => (
              <VideoListItem key={asset.id} asset={asset} thumbnail={thumbnails[asset.id]} onDelete={handleDelete} draggable />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Subtítulos">
            <SubtitlePanel
              hasTimeline={!!timelineState.timeline}
              state={subtitlesState.state}
              subtitles={subtitlesState.subtitles}
              error={subtitlesState.error}
              language={subtitlesState.language}
              setLanguage={subtitlesState.setLanguage}
              generate={handleGenerateSubtitles}
              importFile={subtitlesState.importFile}
              segmentsVisible={segmentsVisible}
              onToggleSegments={handleToggleSegments}
              projectName={projectName}
            />

            <ImproveSubtitlesTool
              hasAccess={hasShortsAccess}
              hasSubtitles={!!subtitlesState.subtitles && subtitlesState.subtitles.segments.length > 0}
              state={shortsState.improveState}
              error={shortsState.improveError}
              onImprove={handleImproveSubtitles}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Shorts" badge="Premium">
            <CreateShortsTool
              hasAccess={hasShortsAccess}
              hasSubtitles={!!subtitlesState.subtitles && subtitlesState.subtitles.segments.length > 0}
              state={shortsState.createShortsState}
              error={shortsState.createShortsError}
              shorts={shortsState.shorts}
              warnings={shortsState.warnings}
              onCreateShorts={handleCreateShorts}
            />
          </CollapsibleSection>
        </div>
      </div>

      {assets.length > 0 && (
        <div className="min-w-0 shrink-0">
          <Timeline
            state={timelineState}
            assets={assets}
            thumbnails={thumbnails}
            projectId={projectId}
            projectName={projectName}
            subtitlesProgressUntilMs={subtitlesProgressUntilMs}
            activeSubtitleRangeMs={activeSubtitleRangeMs}
            autoFitSignal={fitTrigger}
            isDetectingSilence={isDetectingSilence}
            onDetectSilence={() => void handleDetectSilence()}
            silenceThresholdDb={silenceThresholdDb}
            onSilenceThresholdDbChange={setSilenceThresholdDb}
            silencePaddingMs={silencePaddingMs}
            onSilencePaddingMsChange={setSilencePaddingMs}
            removedChips={removedChips}
            onRestoreChip={(index) => void handleRestoreChip(index)}
          />
        </div>
      )}

      {segmentsVisible && subtitlesState.subtitles && subtitlesState.subtitles.segments.length > 0 && (
        <div className="min-w-0 shrink-0 rounded-lg border border-border bg-bg p-4">
          <SubtitleSegmentList
            segments={subtitlesState.subtitles.segments}
            activeSegmentId={activeSegmentId}
            onSeek={handleSeek}
            onEditText={handleEditSegmentText}
            onEditTiming={handleEditSegmentTiming}
            pendingDiffs={pendingSubtitleDiffs}
            onRevertSegment={handleRevertImprovedSegment}
          />
        </div>
      )}
    </div>
  )
}
