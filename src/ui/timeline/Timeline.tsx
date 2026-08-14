import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import { getTimelineDurationMs, type TrimEdge } from '@domain/timeline'
import type { VideoAsset } from '@domain/video'
import type { ArrangeError } from '@application/timeline/ArrangeClipsUseCase'
import { TimeRuler } from './TimeRuler'
import { TimelinePlayer } from './TimelinePlayer'
import { Track } from './Track'
import { useTimeline } from './useTimeline'

const ERROR_MESSAGES: Record<ArrangeError, string> = {
  OVERLAP: 'El clip se superpone con otro. Muévelo a un espacio libre.',
  TRACK_FULL: 'No hay espacio disponible en las pistas.',
  INVALID_DURATION: 'Duración de clip inválida.',
  INVALID_OFFSET: 'Posición de clip inválida.',
  CLIP_NOT_FOUND: 'El clip ya no existe.',
  TRACK_NOT_FOUND: 'La pista ya no existe.',
  TRIM_EXCEEDS_SOURCE: 'No hay más material disponible en ese extremo del video.',
  CORRUPTED_DATA: 'El timeline guardado tiene datos corruptos y no se puede cargar. Elimina el proyecto o el timeline desde IndexedDB para empezar de nuevo.',
  STORAGE_ERROR: 'No se pudo guardar el timeline.',
}

interface TimelineProps {
  projectId: string
  assets: VideoAsset[]
  thumbnails: Record<string, Blob>
  onError?: (error: ArrangeError) => void
}

export function Timeline({ projectId, assets, thumbnails, onError }: TimelineProps) {
  const {
    timeline,
    error,
    pxPerSec,
    setPxPerSec,
    addClip,
    moveClip,
    resizeClip,
    playheadMs,
    setPlayheadMs,
    isPlaying,
    setIsPlaying,
    pxToMs,
  } = useTimeline(projectId)
  const [isOverEmpty, setIsOverEmpty] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleFitToScreen = useCallback(() => {
    if (!timeline) return
    const container = scrollContainerRef.current
    if (!container) return

    const durationMs = getTimelineDurationMs(timeline)
    if (durationMs <= 0) return

    const availableWidthPx = container.clientWidth
    const fitPxPerSec = (availableWidthPx / durationMs) * 1000
    setPxPerSec(Math.max(1, Math.floor(fitPxPerSec)))
  }, [timeline, setPxPerSec])

  const assetsById = useMemo(
    () => Object.fromEntries(assets.map((asset) => [asset.id, asset])),
    [assets],
  )

  const handleDropAsset = useCallback(
    (assetId: string, trackId: string, offsetPx: number) => {
      const asset = assetsById[assetId]
      if (!asset) return
      void addClip(assetId, asset.durationMs, trackId, offsetPx)
    },
    [assetsById, addClip],
  )

  const handleMoveClip = useCallback(
    (clipId: string, trackId: string, offsetPx: number) => {
      void moveClip(clipId, trackId, offsetPx)
    },
    [moveClip],
  )

  const handleResizeClip = useCallback(
    (clipId: string, edge: TrimEdge, boundaryPx: number, sourceDurationMs: number) => {
      void resizeClip(clipId, edge, boundaryPx, sourceDurationMs)
    },
    [resizeClip],
  )

  const handleEmptyDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsOverEmpty(false)
      const raw = event.dataTransfer.getData('text/plain')
      if (!raw) return
      try {
        const payload = JSON.parse(raw) as { kind: string; id: string }
        if (payload.kind !== 'asset') return
        const asset = assetsById[payload.id]
        if (!asset) return
        void addClip(payload.id, asset.durationMs)
      } catch {
        /* ignore malformed payload */
      }
    },
    [assetsById, addClip],
  )

  if (error) {
    onError?.(error)
  }

  if (!timeline) {
    if (error) {
      return (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {ERROR_MESSAGES[error]}
        </div>
      )
    }
    return null
  }

  const tracks = timeline.tracks.length > 0 ? timeline.tracks : [{ id: '__placeholder__', clips: [] }]

  const containerWidthPx = scrollContainerRef.current?.clientWidth ?? 600
  const contentWidthPx = Math.max(
    containerWidthPx,
    ...timeline.tracks.flatMap((track) =>
      track.clips.map((clip) => ((clip.offsetMs + clip.durationMs) / 1000) * pxPerSec + 100),
    ),
  )
  const playheadPx = (playheadMs / 1000) * pxPerSec

  return (
    <div className="flex flex-col gap-3">
      <TimelinePlayer
        timeline={timeline}
        assets={assetsById}
        playheadMs={playheadMs}
        isPlaying={isPlaying}
        onPlayheadChange={setPlayheadMs}
        onPlayingChange={setIsPlaying}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying((value) => !value)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-strong hover:bg-surface-hover"
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <rect x="6" y="5" width="4" height="14" />
                <rect x="14" y="5" width="4" height="14" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <span className="text-sm font-medium text-text-strong">Timeline</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <button
            type="button"
            onClick={handleFitToScreen}
            className="rounded-lg border border-border px-2 py-1 hover:bg-surface-hover"
            title="Ajustar todo el timeline a la pantalla"
          >
            Ajustar
          </button>
          <button
            type="button"
            onClick={() => setPxPerSec((value) => Math.max(1, Math.floor(value / 2)))}
            className="rounded-lg border border-border px-2 py-1 hover:bg-surface-hover"
          >
            −
          </button>
          <span>Zoom</span>
          <button
            type="button"
            onClick={() => setPxPerSec((value) => Math.max(value * 2, value + 1))}
            className="rounded-lg border border-border px-2 py-1 hover:bg-surface-hover"
          >
            +
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {ERROR_MESSAGES[error]}
        </div>
      )}

      <div ref={scrollContainerRef} className="overflow-x-auto">
        <div className="relative" style={{ width: contentWidthPx }}>
          <TimeRuler pxPerSec={pxPerSec} widthPx={contentWidthPx} onClickPosition={(px) => setPlayheadMs(pxToMs(px))} />

          <div
            style={{ left: playheadPx }}
            className="pointer-events-none absolute top-0 z-10 h-full w-0 border-l-2 border-danger"
          >
            <div className="absolute -left-1.5 -top-0 h-3 w-3 rotate-45 bg-danger" />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            {tracks.map((track) =>
              track.id === '__placeholder__' ? (
                <div
                  key={track.id}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsOverEmpty(true)
                  }}
                  onDragLeave={() => setIsOverEmpty(false)}
                  onDrop={handleEmptyDrop}
                  className={`flex h-20 items-center justify-center rounded-lg border border-dashed text-sm transition-colors ${
                    isOverEmpty
                      ? 'border-accent-border bg-accent-bg text-text-strong'
                      : 'border-border text-text-muted'
                  }`}
                >
                  Arrastra un video aquí para empezar
                </div>
              ) : (
                <Track
                  key={track.id}
                  track={track}
                  timeline={timeline}
                  assets={assetsById}
                  thumbnails={thumbnails}
                  pxPerSec={pxPerSec}
                  playheadMs={playheadMs}
                  onDropAsset={handleDropAsset}
                  onMoveClip={handleMoveClip}
                  onResizeClip={handleResizeClip}
                />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
