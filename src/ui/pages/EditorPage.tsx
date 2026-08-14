import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { VideoAsset, VideoUploadResult } from '@domain/video'
import { VideoListItem } from '@ui/components/VideoListItem'
import { VideoUploader } from '@ui/components/VideoUploader'
import { Timeline } from '@ui/timeline/Timeline'
import { TimelinePlayer } from '@ui/timeline/TimelinePlayer'
import { useTimeline } from '@ui/timeline/useTimeline'
import { videoStorage } from '@ui/video/composition'

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, Blob>>({})
  const timelineState = useTimeline(projectId ?? '')

  const loadAssets = useCallback(async () => {
    if (!projectId) return
    const stored = await videoStorage.getByProject(projectId)
    setAssets(stored)
  }, [projectId])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

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

  const handleDelete = useCallback(async (id: string) => {
    await videoStorage.delete(id)
    setAssets((previous) => previous.filter((asset) => asset.id !== id))
  }, [])

  const assetsById = useMemo(
    () => Object.fromEntries(assets.map((asset) => [asset.id, asset])),
    [assets],
  )

  if (!projectId) {
    return null
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {timelineState.timeline ? (
            <TimelinePlayer
              timeline={timelineState.timeline}
              assets={assetsById}
              playheadMs={timelineState.playheadMs}
              isPlaying={timelineState.isPlaying}
              onPlayheadChange={timelineState.setPlayheadMs}
              onPlayingChange={timelineState.setIsPlaying}
            />
          ) : (
            <div className="flex h-[220px] items-center justify-center rounded-lg border border-border bg-bg text-sm text-text-muted">
              Cargando timeline…
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:w-80 lg:shrink-0">
          <VideoUploader projectId={projectId} onUploaded={handleUploaded} />
          {assets.length > 0 && (
            <div className="flex flex-col gap-2">
              {assets.map((asset) => (
                <VideoListItem
                  key={asset.id}
                  asset={asset}
                  thumbnail={thumbnails[asset.id]}
                  onDelete={handleDelete}
                  draggable
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {assets.length > 0 && (
        <Timeline state={timelineState} assets={assets} thumbnails={thumbnails} />
      )}
    </div>
  )
}
