import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { VideoAsset, VideoUploadResult } from '@domain/video'
import { VideoPreview } from '@ui/components/VideoPreview'
import { VideoUploader } from '@ui/components/VideoUploader'
import { Timeline } from '@ui/timeline/Timeline'
import { videoStorage } from '@ui/video/composition'

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, Blob>>({})

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

  if (!projectId) {
    return null
  }

  return (
    <div>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <VideoUploader projectId={projectId} onUploaded={handleUploaded} />
        {assets.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => (
                <VideoPreview
                  key={asset.id}
                  asset={asset}
                  thumbnail={thumbnails[asset.id]}
                  onDelete={handleDelete}
                  draggable
                />
              ))}
            </div>
            <Timeline projectId={projectId} assets={assets} thumbnails={thumbnails} />
          </>
        )}
      </div>
    </div>
  )
}
