import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { getTimelineDurationMs, type Timeline as TimelineModel, type TrimEdge } from '@domain/timeline'
import type { VideoAsset } from '@domain/video'
import type { ArrangeError } from '@application/timeline/ArrangeClipsUseCase'
import { useExport } from '@ui/hooks/useExport'
import { TimeRuler } from './TimeRuler'
import { Track } from './Track'
import type { useTimeline } from './useTimeline'

const ERROR_MESSAGES: Record<ArrangeError, string> = {
  OVERLAP: 'El clip se superpone con otro. Muévelo a un espacio libre.',
  TRACK_FULL: 'No hay espacio disponible en las pistas.',
  INVALID_DURATION: 'Duración de clip inválida.',
  INVALID_OFFSET: 'Posición de clip inválida.',
  CLIP_NOT_FOUND: 'El clip ya no existe.',
  TRACK_NOT_FOUND: 'La pista ya no existe.',
  TRIM_EXCEEDS_SOURCE: 'No hay más material disponible en ese extremo del video.',
  CUT_OUT_OF_BOUNDS: 'El punto de corte está fuera de los límites del clip.',
  CUT_ZERO_LENGTH: 'El punto de corte coincide con un borde del clip.',
  CORRUPTED_DATA: 'El timeline guardado tiene datos corruptos y no se puede cargar. Elimina el proyecto o el timeline desde IndexedDB para empezar de nuevo.',
  STORAGE_ERROR: 'No se pudo guardar el timeline.',
}

interface TimelineProps {
  state: ReturnType<typeof useTimeline>
  assets: VideoAsset[]
  thumbnails: Record<string, Blob>
  projectId: string
  projectName?: string
  onError?: (error: ArrangeError) => void
}

export function Timeline({ state, assets, thumbnails, projectId, projectName, onError }: TimelineProps) {
  const {
    timeline,
    error,
    pxPerSec,
    setPxPerSec,
    addClip,
    moveClip,
    resizeClip,
    splitClip,
    undo,
    redo,
    canUndo,
    canRedo,
    playheadMs,
    setPlayheadMs,
    isPlaying,
    setIsPlaying,
    pxToMs,
    selectedClipId,
    setSelectedClipId,
  } = state
  const [isOverEmpty, setIsOverEmpty] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const {
    exporting,
    progress: exportProgress,
    phaseLabel: exportPhaseLabel,
    error: exportError,
    completed: exportCompleted,
    downloadedFileName,
    exportProject,
    abortExport,
  } = useExport()

  const handleFitToScreen = useCallback(() => {
    if (!timeline) return
    const container = scrollContainerRef.current
    if (!container) return

    const durationMs = getTimelineDurationMs(timeline as TimelineModel)
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

  const handleSelectClip = useCallback(
    (clipId: string) => {
      setSelectedClipId(clipId)
    },
    [setSelectedClipId],
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

  useEffect(() => {
    if (error) {
      onError?.(error)
    }
  }, [error, onError])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          void redo()
        } else {
          void undo()
        }
        return
      }

      if (event.key.toLowerCase() === 's' && selectedClipId && timeline) {
        const clip = timeline.tracks.flatMap((track) => track.clips).find((c) => c.id === selectedClipId)
        if (clip && playheadMs > clip.offsetMs && playheadMs < clip.offsetMs + clip.durationMs) {
          void splitClip(selectedClipId, playheadMs)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, splitClip, selectedClipId, playheadMs, timeline])

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

  const selectedClip = selectedClipId
    ? timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedClipId)
    : null
  const canCut = !!selectedClip && playheadMs > selectedClip.offsetMs && playheadMs < selectedClip.offsetMs + selectedClip.durationMs

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying((value) => !value)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-strong hover:bg-surface-hover sm:h-8 sm:w-8"
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
          <div className="ml-2 flex items-center gap-1 border-l border-border pl-2">
            <button
              type="button"
              onClick={() => void undo()}
              disabled={!canUndo}
              aria-label="Deshacer"
              title="Deshacer (Ctrl+Z)"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-strong hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↶
            </button>
            <button
              type="button"
              onClick={() => void redo()}
              disabled={!canRedo}
              aria-label="Rehacer"
              title="Rehacer (Ctrl+Shift+Z)"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-strong hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↷
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm text-text-muted">
          <button
            type="button"
            onClick={handleFitToScreen}
            className="rounded-lg border border-border px-3 py-2.5 hover:bg-surface-hover sm:py-1"
            title="Ajustar todo el timeline a la pantalla"
          >
            Ajustar
          </button>
          <button
            type="button"
            onClick={() => setPxPerSec((value) => Math.max(1, Math.floor(value / 2)))}
            aria-label="Reducir zoom"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border hover:bg-surface-hover sm:h-8 sm:w-8"
          >
            −
          </button>
          <span className="hidden sm:inline">Zoom</span>
          <button
            type="button"
            onClick={() => setPxPerSec((value) => Math.max(value * 2, value + 1))}
            aria-label="Aumentar zoom"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border hover:bg-surface-hover sm:h-8 sm:w-8"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => void exportProject(projectId, projectName)}
            disabled={exporting}
            className="ml-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-bg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? `Exportando… ${exportProgress}%` : 'Exportar'}
          </button>
          {exporting && (
            <button
              type="button"
              onClick={abortExport}
              className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-text-strong hover:bg-surface-hover sm:py-1"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {ERROR_MESSAGES[error]}
        </div>
      )}

      {exporting && exportPhaseLabel && (
        <div role="status" className="rounded-lg bg-accent-bg px-3 py-2 text-sm text-text-strong">
          {exportPhaseLabel} ({exportProgress}%)
        </div>
      )}

      {exportError && (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {exportError}
        </div>
      )}

      {exportCompleted && (
        <div role="status" className="rounded-lg bg-success-bg px-3 py-2 text-sm text-success">
          Descarga iniciada{downloadedFileName ? `: ${downloadedFileName}` : ''}. Revisa las descargas de tu
          navegador; el video ya está listo para usarse cuando termine de guardarse.
        </div>
      )}

      <div ref={scrollContainerRef} className="overflow-x-auto pt-7">
        <div className="relative" style={{ width: contentWidthPx }}>
          {canCut && (
            <button
              type="button"
              onClick={() => selectedClipId && void splitClip(selectedClipId, playheadMs)}
              style={{ left: playheadPx }}
              title="Cortar en el playhead (S)"
              aria-label="Cortar clip"
              className="absolute -top-7 z-20 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-accent bg-surface text-accent shadow-md transition-transform hover:scale-110 hover:bg-accent hover:text-white"
            >
              ✂
            </button>
          )}

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
                  selectedClipId={selectedClipId}
                  onDropAsset={handleDropAsset}
                  onMoveClip={handleMoveClip}
                  onResizeClip={handleResizeClip}
                  onSelectClip={handleSelectClip}
                />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
