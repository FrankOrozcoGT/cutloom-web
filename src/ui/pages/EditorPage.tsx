import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Subtitles } from '@domain/subtitles'
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

  const timelineState = useTimeline(projectId ?? '', subtitlesBridge)

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

  const handleDetectSilence = useCallback(() => {
    if (!subtitlesState.subtitles) return
    shortsState.detectSilence(subtitlesState.subtitles.segments)
  }, [subtitlesState.subtitles, shortsState])

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
            hasSubtitles={!!subtitlesState.subtitles && subtitlesState.subtitles.segments.length > 0}
            silenceCuts={shortsState.silenceCuts}
            onDetectSilence={handleDetectSilence}
            onRemoveSilenceCut={shortsState.removeSilenceCut}
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
