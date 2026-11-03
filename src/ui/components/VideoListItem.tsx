import { useState, type DragEvent } from 'react'
import type { VideoAsset } from '@domain/video'
import { formatDurationMs } from '@ui/format'
import { useObjectUrl } from '@ui/hooks/useObjectUrl'

interface VideoListItemProps {
  asset: VideoAsset
  thumbnail?: Blob
  onDelete?: (id: string) => void
  draggable?: boolean
}

export function VideoListItem({ asset, thumbnail, onDelete, draggable }: VideoListItemProps) {
  const [isHovering, setIsHovering] = useState(false)
  const thumbnailUrl = useObjectUrl(thumbnail)
  const previewUrl = useObjectUrl(isHovering ? asset.blob : undefined)

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'asset', id: asset.id }))
  }

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2 transition-colors hover:bg-surface-hover"
    >
      <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-bg">
        {thumbnailUrl && (
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
        {previewUrl && (
          <video
            src={previewUrl}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-text-strong">{asset.name}</span>
        <span className="text-xs text-text-muted">{formatDurationMs(asset.durationMs)}</span>
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(asset.id)}
          className="shrink-0 rounded-lg px-3 py-2.5 text-sm text-danger hover:bg-danger-bg"
        >
          Eliminar
        </button>
      )}
    </div>
  )
}
