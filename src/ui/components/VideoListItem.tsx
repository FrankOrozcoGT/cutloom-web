import { useEffect, useState, type DragEvent } from 'react'
import type { VideoAsset } from '@domain/video'

interface VideoListItemProps {
  asset: VideoAsset
  thumbnail?: Blob
  onDelete?: (id: string) => void
  draggable?: boolean
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function VideoListItem({ asset, thumbnail, onDelete, draggable }: VideoListItemProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState('')

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
      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2 transition-colors hover:bg-surface-hover"
    >
      <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md bg-bg">
        {thumbnailUrl && (
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-text-strong">{asset.name}</span>
        <span className="text-xs text-text-muted">{formatDuration(asset.durationMs)}</span>
      </div>
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
  )
}
