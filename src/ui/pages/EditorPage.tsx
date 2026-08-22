import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Subtitles } from '@domain/subtitles'
import type { VideoAsset, VideoUploadResult } from '@domain/video'
import { SubtitlePanel } from '@ui/components/SubtitlePanel'
import { SubtitleSegmentList } from '@ui/components/SubtitleSegmentList'
import { TabButton } from '@ui/components/TabButton'
import { VideoListItem } from '@ui/components/VideoListItem'
import { VideoUploader } from '@ui/components/VideoUploader'
import { Timeline } from '@ui/timeline/Timeline'
import { TimelinePlayer } from '@ui/timeline/TimelinePlayer'
import { useTimeline } from '@ui/timeline/useTimeline'
import { useSubtitles } from '@ui/hooks/useSubtitles'
import { videoStorage, projectUseCase } from '@ui/video/composition'

type SidebarTab = 'videos' | 'subtitles'

function videosTabLabel(assetCount: number): string {
  return assetCount > 0 ? `Videos (${assetCount})` : 'Videos'
}

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, Blob>>({})
  const [projectName, setProjectName] = useState('')
  const [segmentsVisible, setSegmentsVisible] = useState(false)
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SidebarTab>('videos')

  const subtitlesState = useSubtitles(projectId ?? '')

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
    setActiveTab('subtitles')
    setFitTrigger((previous) => (previous ?? 0) + 1)
    await subtitlesState.generate()
  }, [subtitlesState])

  const handleToggleSegments = useCallback(() => {
    setSegmentsVisible((previous) => !previous)
  }, [])

  const handleSegmentClick = useCallback((segmentId: string) => {
    setActiveSegmentId(segmentId)
    setSegmentsVisible(true)
    setActiveTab('subtitles')
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

  if (!projectId) {
    return null
  }

  const subtitlesProgressUntilMs =
    subtitlesState.state === 'transcribing' || subtitlesState.state === 'extracting_audio'
      ? subtitlesState.processedUntilMs
      : null
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

        <div className="flex min-h-0 flex-col lg:w-80 lg:shrink-0">
          <div className="flex shrink-0 gap-1 border-b border-border">
            <TabButton label={videosTabLabel(assets.length)} isActive={activeTab === 'videos'} onClick={() => setActiveTab('videos')} />
            <TabButton label="Subtítulos" isActive={activeTab === 'subtitles'} onClick={() => setActiveTab('subtitles')} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-3">
            {activeTab === 'videos' && (
              <>
                <VideoUploader projectId={projectId} onUploaded={handleUploaded} />
                {assets.map((asset) => (
                  <VideoListItem
                    key={asset.id}
                    asset={asset}
                    thumbnail={thumbnails[asset.id]}
                    onDelete={handleDelete}
                    draggable
                  />
                ))}
              </>
            )}

            {activeTab === 'subtitles' && (
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
            )}
          </div>
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
