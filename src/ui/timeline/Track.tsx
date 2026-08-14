import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import {
  detectOverlap,
  snapToNearestClip,
  type Timeline as TimelineModel,
  type Track as TrackModel,
  type TrimEdge,
} from '@domain/timeline'
import type { VideoAsset } from '@domain/video'
import { TimelineClip } from './TimelineClip'

interface DragPayload {
  kind: 'asset' | 'clip'
  id: string
  grabOffsetPx?: number
}

interface TrackProps {
  track: TrackModel
  timeline: TimelineModel
  assets: Record<string, VideoAsset>
  thumbnails: Record<string, Blob>
  pxPerSec: number
  playheadMs: number
  onDropAsset: (assetId: string, trackId: string, offsetPx: number) => void
  onMoveClip: (clipId: string, trackId: string, offsetPx: number) => void
  onResizeClip: (clipId: string, edge: TrimEdge, boundaryPx: number, sourceDurationMs: number) => void
}

export function Track({
  track,
  timeline,
  assets,
  thumbnails,
  pxPerSec,
  playheadMs,
  onDropAsset,
  onMoveClip,
  onResizeClip,
}: TrackProps) {
  const [isOver, setIsOver] = useState(false)
  const [snapLineMs, setSnapLineMs] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const trimRef = useRef<{ clipId: string; edge: TrimEdge } | null>(null)

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsOver(true)

      const raw = event.dataTransfer.types.includes('text/plain')
      if (!raw) return

      const rect = event.currentTarget.getBoundingClientRect()
      const offsetPx = Math.max(0, event.clientX - rect.left)
      const offsetMs = (offsetPx / pxPerSec) * 1000

      // Duración estimada solo para previsualizar el snap; el clip real se resuelve en el drop.
      // dataTransfer.getData no está disponible durante dragover (restricción del navegador),
      // así que aquí no se puede compensar el punto exacto donde se agarró el clip — el
      // resultado preciso se calcula en handleDrop, donde sí se puede leer el payload completo.
      const estimatedDurationMs = 3000
      const snapped = snapToNearestClip(timeline, offsetMs, estimatedDurationMs, { playheadMs })
      setSnapLineMs(snapped !== offsetMs ? snapped : null)
    },
    [pxPerSec, timeline, playheadMs],
  )

  const handleDragLeave = useCallback(() => {
    setIsOver(false)
    setSnapLineMs(null)
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsOver(false)
      setSnapLineMs(null)

      const raw = event.dataTransfer.getData('text/plain')
      if (!raw) return

      let payload: DragPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return
      }

      const rect = event.currentTarget.getBoundingClientRect()
      const cursorOffsetPx = Math.max(0, event.clientX - rect.left)

      if (payload.kind === 'asset') {
        onDropAsset(payload.id, track.id, cursorOffsetPx)
      } else if (payload.kind === 'clip') {
        // Resta el punto donde el usuario agarró el clip para que el borde
        // izquierdo del clip quede bajo esa posición relativa, no bajo el cursor.
        const clipOffsetPx = Math.max(0, cursorOffsetPx - (payload.grabOffsetPx ?? 0))
        onMoveClip(payload.id, track.id, clipOffsetPx)
      }
    },
    [track.id, onDropAsset, onMoveClip],
  )

  const handleTrimStart = useCallback((clipId: string, edge: TrimEdge) => {
    trimRef.current = { clipId, edge }
  }, [])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!trimRef.current || !trackRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const boundaryPx = Math.max(0, event.clientX - rect.left)
      const clip = track.clips.find((c) => c.id === trimRef.current?.clipId)
      const asset = clip ? assets[clip.assetId] : undefined
      if (!clip || !asset) return
      onResizeClip(trimRef.current.clipId, trimRef.current.edge, boundaryPx, asset.durationMs)
    }

    function handlePointerUp() {
      trimRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [track.clips, assets, onResizeClip])

  const conflictIds = new Set(
    track.clips
      .filter((clip, index) =>
        track.clips.some((other, otherIndex) => otherIndex !== index && detectOverlap(clip, other)),
      )
      .map((clip) => clip.id),
  )

  const snapLinePx = snapLineMs !== null ? (snapLineMs / 1000) * pxPerSec : null

  return (
    <div
      ref={trackRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative h-20 rounded-lg border border-dashed transition-colors ${
        isOver ? 'border-accent-border bg-accent-bg' : 'border-border bg-surface'
      }`}
    >
      {snapLinePx !== null && (
        <div
          style={{ left: snapLinePx }}
          className="pointer-events-none absolute inset-y-0 w-0 border-l-2 border-dashed border-accent"
        />
      )}

      {track.clips.map((clip) => {
        const asset = assets[clip.assetId]
        if (!asset) return null
        return (
          <TimelineClip
            key={clip.id}
            clip={clip}
            asset={asset}
            thumbnail={thumbnails[asset.id]}
            pxPerSec={pxPerSec}
            hasConflict={conflictIds.has(clip.id)}
            onDragStart={() => {}}
            onTrimStart={handleTrimStart}
          />
        )
      })}
    </div>
  )
}
