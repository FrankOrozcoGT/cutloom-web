import { useEffect, useState, type DragEvent, type PointerEvent } from 'react'
import type { Clip, TrimEdge } from '@domain/timeline'
import type { VideoAsset } from '@domain/video'

interface TimelineClipProps {
  clip: Clip
  asset: VideoAsset
  thumbnail?: Blob
  pxPerSec: number
  hasConflict?: boolean
  isSelected?: boolean
  onDragStart: (clipId: string) => void
  onTrimStart: (clipId: string, edge: TrimEdge) => void
  onSelect?: (clipId: string) => void
}

function formatDuration(ms: number): string {
  const seconds = ms / 1000
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`
}

export function TimelineClip({
  clip,
  asset,
  thumbnail,
  pxPerSec,
  hasConflict,
  isSelected,
  onDragStart,
  onTrimStart,
  onSelect,
}: TimelineClipProps) {
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

  const left = (clip.offsetMs / 1000) * pxPerSec
  const width = Math.max(24, (clip.durationMs / 1000) * pxPerSec)

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const grabOffsetPx = event.clientX - rect.left
    event.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'clip', id: clip.id, grabOffsetPx }))
    onDragStart(clip.id)
  }

  function handleTrimPointerDown(edge: TrimEdge) {
    return (event: PointerEvent<HTMLDivElement>) => {
      event.stopPropagation()
      event.preventDefault()
      onTrimStart(clip.id, edge)
    }
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onSelect?.(clip.id)}
      style={{ left, width }}
      className={`group absolute top-1 flex h-16 flex-col overflow-hidden rounded-lg border bg-surface text-xs shadow-sm ${
        hasConflict ? 'border-danger ring-2 ring-danger' : isSelected ? 'border-accent ring-2 ring-accent' : 'border-border'
      }`}
    >
      {thumbnailUrl && <img src={thumbnailUrl} alt="" className="h-8 w-full object-cover" draggable={false} />}
      <div className="flex flex-1 flex-col justify-center px-1.5">
        <span className="truncate text-text-strong">{asset.name}</span>
        <span className="text-text-muted">{formatDuration(clip.durationMs)}</span>
      </div>

      <div
        onPointerDown={handleTrimPointerDown('start')}
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-accent/0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent/40"
      />
      <div
        onPointerDown={handleTrimPointerDown('end')}
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-accent/0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent/40"
      />
    </div>
  )
}
