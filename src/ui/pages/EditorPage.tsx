import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { TARGET_SAMPLE_RATE } from '@domain/shorts'
import type { Subtitles } from '@domain/subtitles'
import { detectSilenceCuts, type RemovedSegment } from '@domain/timeline'
import type { VideoAsset, VideoUploadResult } from '@domain/video'
import { CollapsibleSection } from '@ui/components/CollapsibleSection'
import { CreateShortsTool } from '@ui/components/CreateShortsTool'
import { ImproveSubtitlesTool } from '@ui/components/ImproveSubtitlesTool'
import { SubtitlePanel } from '@ui/components/SubtitlePanel'
import { SubtitleSegmentList } from '@ui/components/SubtitleSegmentList'
import { VideoListItem } from '@ui/components/VideoListItem'
import { VideoUploader } from '@ui/components/VideoUploader'
import { Timeline } from '@ui/timeline/Timeline'
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

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, Blob>>({})
  const [projectName, setProjectName] = useState('')
  const [segmentsVisible, setSegmentsVisible] = useState(false)
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [removedSilences, setRemovedSilences] = useState<RemovedSegment[]>([])
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

  // Los chips de silencios quitados guardan offsets del timeline en el que se
  // detectaron — si el timeline se reemplaza por completo (cargar proyecto,
  // undo, redo, vaciar) ya no corresponden y hay que descartarlos.
  const clearRemovedSilences = useCallback(() => setRemovedSilences([]), [])

  const timelineState = useTimeline(projectId ?? '', subtitlesBridge, clearRemovedSilences)

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
      const removed = await timelineState.removeSegments(cuts)
      setRemovedSilences((previous) => [...previous, ...[...removed].reverse()])
    }
    setIsDetectingSilence(false)
  }, [projectId, timelineState, silenceThresholdDb, silencePaddingMs])

  const handleRestoreSilence = useCallback(
    async (index: number) => {
      const removed = removedSilences[index]
      if (!removed) return
      await timelineState.reinsertSegment(removed)
      setRemovedSilences((previous) => previous.filter((_, i) => i !== index))
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
