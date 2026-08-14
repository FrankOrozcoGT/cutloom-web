import { useEffect, useState, type DragEvent } from 'react'
import type { VideoAsset } from '@domain/video'

interface VideoPreviewProps {
  asset: VideoAsset
  thumbnail?: Blob
  onDelete?: (id: string) => void
  draggable?: boolean
}

export function VideoPreview({ asset, thumbnail, onDelete, draggable }: VideoPreviewProps) {
  const [videoUrl, setVideoUrl] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')

  useEffect(() => {
    const url = URL.createObjectURL(asset.blob)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [asset.blob])

  useEffect(() => {
    if (!thumbnail) {
      setThumbnailUrl('')
      return
    }
    const url = URL.createObjectURL(thumbnail)
    setThumbnailUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [thumbnail])

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'asset', id: asset.id }))
  }

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
    >
      {videoUrl && (
        <video
          src={videoUrl}
          poster={thumbnailUrl || undefined}
          controls
          draggable={false}
          className="w-full rounded-lg bg-bg"
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-text-muted">{asset.name}</span>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(asset.id)}
            className="shrink-0 text-sm text-danger hover:underline"
          >
            Eliminar
          </button>
        )}
      </div>
    </div>
  )
}
