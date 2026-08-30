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
import { Timeline, type RemovedSilenceChip } from '@ui/timeline/Timeline'
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
function removedSilencesKey(projectId: string): string {
  return `cutloom:removed-silences:${projectId}`
}

function loadRemovedSilences(projectId: string): RemovedSilenceChip[] {
  try {
    const raw = localStorage.getItem(removedSilencesKey(projectId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((chip): chip is RemovedSilenceChip => {
      const candidate = chip as RemovedSilenceChip | null
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

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, Blob>>({})
  const [projectName, setProjectName] = useState('')
  const [segmentsVisible, setSegmentsVisible] = useState(false)
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [removedSilences, setRemovedSilences] = useState<RemovedSilenceChip[]>(() =>
    projectId ? loadRemovedSilences(projectId) : [],
  )
  const [isDetectingSilence, setIsDetectingSilence] = useState(false)
  const [silenceThresholdDb, setSilenceThresholdDb] = useState(-40)
  const [silencePaddingMs, setSilencePaddingMs] = useState(1000)

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

  // Los chips de silencios quitados viajan dentro del historial del timeline
  // (sus offsets solo corresponden al timeline en el que se detectaron) — el
  // bridge expone el estado actual y restaura snapshots en undo/redo/vaciar
  // sin depender de la identidad de removedSilences en cada render.
  const removedSilencesRef = useRef(removedSilences)
  removedSilencesRef.current = removedSilences
  const removedSilencesBridge = useMemo(
    () => ({
      get: () => removedSilencesRef.current,
      restore: (chips: RemovedSilenceChip[]) => setRemovedSilences(chips),
    }),
    [],
  )

  const timelineState = useTimeline(projectId ?? '', subtitlesBridge, removedSilencesBridge)

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
    setRemovedSilences(projectId ? loadRemovedSilences(projectId) : [])
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
      localStorage.setItem(removedSilencesKey(projectId), JSON.stringify(removedSilences))
    } catch {
      // localStorage lleno o no disponible — los chips siguen funcionando en memoria.
    }
  }, [projectId, removedSilences])

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
      void shortsState.improveSubtitles(projectId, subtitlesState.subtitles.segments, userContext)
    },
    [projectId, subtitlesState.subtitles, shortsState],
  )

  const handleApproveImprovedSubtitles = useCallback(() => {
    if (!subtitlesState.subtitles) return
    for (const improved of shortsState.improvedSubtitles) {
      const segment = subtitlesState.subtitles.segments.find(
        (s) => s.startMs === improved.startMs && s.endMs === improved.endMs,
      )
      if (segment) {
        void subtitlesState.editText(segment.id, improved.corrected)
      }
    }
  }, [subtitlesState, shortsState.improvedSubtitles])

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
        const previous = removedSilencesRef.current
        // Los cortes nuevos vienen en coordenadas del timeline previo a este
        // lote — el mismo sistema en el que están los displayOffsetMs
        // anteriores: cada corte desplaza hacia la izquierda todo lo que
        // quedó después de él.
        const shifted = previous.map((chip) => {
          const shiftMs = ascending
            .filter((r) => r.clip.offsetMs <= chip.displayOffsetMs)
            .reduce((total, r) => total + r.clip.durationMs, 0)
          return shiftMs > 0 ? { ...chip, displayOffsetMs: chip.displayOffsetMs - shiftMs } : chip
        })
        // Y dentro del lote, cada corte queda desplazado por los anteriores.
        let removedBeforeMs = 0
        const newChips = ascending.map((r) => {
          const chip: RemovedSilenceChip = { segment: r, displayOffsetMs: r.clip.offsetMs - removedBeforeMs }
          removedBeforeMs += r.clip.durationMs
          return chip
        })
        return [...shifted, ...newChips].sort((a, b) => a.displayOffsetMs - b.displayOffsetMs)
      })
    }
    setIsDetectingSilence(false)
  }, [projectId, timelineState, silenceThresholdDb, silencePaddingMs])

  const handleRestoreSilence = useCallback(
    async (index: number) => {
      const chip = removedSilences[index]
      if (!chip) return
      // Igual que en handleDetectSilence: los chips restantes se calculan acá
      // y se pasan a reinsertSegment para que timeline + chips se apliquen
      // como un solo paso de historial, no dos setState separados que
      // undo/redo desincronizaría en pasos distintos.
      const nextRemovedSilences = removedSilences
        .filter((_, i) => i !== index)
        // Reinsertar el silencio empuja hacia la derecha lo que quedó
        // después de su posición — los chips posteriores se recorren.
        .map((other) =>
          other.displayOffsetMs >= chip.displayOffsetMs
            ? { ...other, displayOffsetMs: other.displayOffsetMs + chip.segment.clip.durationMs }
            : other,
        )
      await timelineState.reinsertSegment(chip.segment, chip.displayOffsetMs, nextRemovedSilences)
    },
    [removedSilences, timelineState],
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
            />

            <ImproveSubtitlesTool
              hasAccess={hasShortsAccess}
              hasSubtitles={!!subtitlesState.subtitles && subtitlesState.subtitles.segments.length > 0}
              state={shortsState.improveState}
              error={shortsState.improveError}
              improvedSubtitles={shortsState.improvedSubtitles}
              onImprove={handleImproveSubtitles}
              onEdit={shortsState.editImprovedSubtitle}
              onRemove={shortsState.removeImprovedSubtitle}
              onApproveAll={handleApproveImprovedSubtitles}
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
            removedSilences={removedSilences}
            onRestoreSilence={(index) => void handleRestoreSilence(index)}
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
          />
        </div>
      )}
    </div>
  )
}
