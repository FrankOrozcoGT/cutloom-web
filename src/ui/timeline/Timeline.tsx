import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { AudioWaveform, Eye, EyeOff, Minus, Pause, Play, Plus, Redo2, Scissors, Trash2, Undo2, X } from 'lucide-react'
import { findClipById, getTimelineDurationMs, type RemovedSegment, type Timeline as TimelineModel, type TrimEdge } from '@domain/timeline'
import type { VideoAsset } from '@domain/video'
import type { ArrangeError } from '@application/timeline/ArrangeClipsUseCase'
import { useExport } from '@ui/hooks/useExport'
import { formatTimelineMs } from '@ui/format'
import { ConfirmDialog } from '@ui/components/ConfirmDialog'
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
  /** Mientras se generan subtítulos: hasta qué punto del timeline (ms) ya se transcribió. */
  subtitlesProgressUntilMs?: number | null
  /** Rango (ms, tiempo de timeline) del segmento de subtítulo activo, para resaltarlo. */
  activeSubtitleRangeMs?: { startMs: number; endMs: number } | null
  /** Cualquier cambio de valor dispara "Ajustar" (fit to screen) — usado para ver el timeline completo al empezar a generar subtítulos. */
  autoFitSignal?: unknown
  /** Cortes por silencio: gratis, analiza el volumen del audio del timeline y elimina cada hueco, cerrando el espacio (mismo mecanismo de datos que un corte real). No depende de subtítulos. */
  isDetectingSilence?: boolean
  onDetectSilence?: () => void
  /** Umbral de silencio en dB (más negativo = más estricto, exige más silencio real) y padding en ms que se deja pegado a la voz en cada corte — configurables por el usuario, con default razonable. */
  silenceThresholdDb?: number
  onSilenceThresholdDbChange?: (value: number) => void
  silencePaddingMs?: number
  onSilencePaddingMsChange?: (value: number) => void
  /** Silencios ya quitados, cada uno reversible por separado con su propia X (no por el historial genérico de undo). */
  removedSilences?: RemovedSilenceChip[]
  onRestoreSilence?: (index: number) => void
}

/**
 * Un silencio quitado con su posición traducida a las coordenadas del
 * timeline YA cortado (displayOffsetMs) — segment.clip.offsetMs guarda la
 * posición en el timeline original, que es la que reinsertSegment necesita
 * para revertir, pero no la que coincide con lo que el usuario ve ahora.
 */
export interface RemovedSilenceChip {
  segment: RemovedSegment
  displayOffsetMs: number
}

/**
 * Ventana alrededor del playhead dentro de la cual un chip de silencio se
 * tiñe de naranja — mientras más cerca está el corte del playhead, más
 * intenso; al alejarse vuelve al tono apagado normal. Así se ubica de un
 * vistazo qué cortes vienen y cuáles ya pasaron durante la reproducción.
 */
const CHIP_PROXIMITY_WINDOW_MS = 30_000
// --color-text-muted y --color-accent de index.css, interpolados a mano para
// no pisar los tokens con clases condicionales.
const MUTED_RGB = [122, 115, 106] as const
const ACCENT_RGB = [255, 107, 74] as const

function chipProximityStyle(displayOffsetMs: number, playheadMs: number): CSSProperties {
  const t = Math.max(0, 1 - Math.abs(displayOffsetMs - playheadMs) / CHIP_PROXIMITY_WINDOW_MS)
  const [r, g, b] = MUTED_RGB.map((channel, i) => Math.round(channel + (ACCENT_RGB[i] - channel) * t))
  return {
    color: `rgb(${r} ${g} ${b})`,
    borderColor: `rgb(${ACCENT_RGB.join(' ')} / ${(0.15 + 0.45 * t).toFixed(2)})`,
    backgroundColor: `rgb(${ACCENT_RGB.join(' ')} / ${(0.14 * t).toFixed(2)})`,
  }
}

export function Timeline({
  state,
  assets,
  thumbnails,
  projectId,
  projectName,
  onError,
  subtitlesProgressUntilMs,
  activeSubtitleRangeMs,
  autoFitSignal,
  isDetectingSilence = false,
  onDetectSilence,
  silenceThresholdDb,
  onSilenceThresholdDbChange,
  silencePaddingMs,
  onSilencePaddingMsChange,
  removedSilences = [],
  onRestoreSilence,
}: TimelineProps) {
  const {
    timeline,
    error,
    pxPerSec,
    setPxPerSec,
    addClip,
    moveClip,
    resizeClip,
    splitClip,
    deleteClip,
    clearAllClips,
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
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false)
  const [silenceChipsVisible, setSilenceChipsVisible] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const {
    exporting,
    progress: exportProgress,
    phaseLabel: exportPhaseLabel,
    error: exportError,
    completed: exportCompleted,
    downloadedFileName,
    aborting: exportAborting,
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

  useEffect(() => {
    if (autoFitSignal === undefined) return
    handleFitToScreen()
    // Solo debe dispararse cuando autoFitSignal cambia de valor, no en cada
    // render donde handleFitToScreen se recrea (depende de timeline/pxPerSec).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFitSignal])

  // Ajusta pxPerSec manteniendo el playhead fijo en su misma posición en pantalla,
  // en vez de que el zoom recentre el scroll y se "pierda" el punto de edición.
  const zoomTo = useCallback(
    (nextPxPerSec: number) => {
      const container = scrollContainerRef.current
      if (!container) {
        setPxPerSec(nextPxPerSec)
        return
      }

      const playheadPxOnScreen = (playheadMs / 1000) * pxPerSec - container.scrollLeft

      setPxPerSec(nextPxPerSec)
      requestAnimationFrame(() => {
        const nextPlayheadPx = (playheadMs / 1000) * nextPxPerSec
        container.scrollLeft = Math.max(0, nextPlayheadPx - playheadPxOnScreen)
      })
    },
    [playheadMs, pxPerSec, setPxPerSec],
  )

  const handleWheelZoom = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
      zoomTo(Math.max(1, Math.round(pxPerSec * factor)))
    },
    [pxPerSec, zoomTo],
  )

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

  // Si el playhead salta a un punto fuera del área visible (p.ej. al hacer click
  // en un segmento de subtítulo lejano), centra el scroll horizontal ahí en vez
  // de dejar la línea roja fuera de vista.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const playheadPx = (playheadMs / 1000) * pxPerSec
    const isVisible = playheadPx >= container.scrollLeft && playheadPx <= container.scrollLeft + container.clientWidth

    if (!isVisible) {
      container.scrollLeft = Math.max(0, playheadPx - container.clientWidth / 2)
    }
  }, [playheadMs, pxPerSec])

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
        const clip = findClipById(timeline, selectedClipId)
        if (clip && playheadMs > clip.offsetMs && playheadMs < clip.offsetMs + clip.durationMs) {
          void splitClip(selectedClipId, playheadMs)
        }
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedClipId) {
        event.preventDefault()
        void deleteClip(selectedClipId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, splitClip, deleteClip, selectedClipId, playheadMs, timeline])

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

  const selectedClip = selectedClipId ? findClipById(timeline, selectedClipId) : null
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
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
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
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void redo()}
              disabled={!canRedo}
              aria-label="Rehacer"
              title="Rehacer (Ctrl+Shift+Z)"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-strong hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
          {selectedClip && (
            <div className="ml-2 flex items-center gap-1 border-l border-border pl-2">
              <button
                type="button"
                onClick={() => void deleteClip(selectedClip.id)}
                aria-label="Eliminar clip seleccionado"
                title="Eliminar clip seleccionado (Supr)"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-danger hover:bg-danger-bg"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
          {timeline.tracks.some((track) => track.clips.length > 0) && (
            <div className="ml-2 flex items-center gap-1 border-l border-border pl-2">
              <button
                type="button"
                onClick={() => setIsClearAllConfirmOpen(true)}
                title="Eliminar todos los clips del timeline"
                className="rounded-lg border border-border px-2 py-1.5 text-xs text-danger hover:bg-danger-bg sm:py-1"
              >
                Vaciar timeline
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm text-text-muted">
          {onDetectSilence && (
            <div className="flex items-center">
              <button
                type="button"
                onClick={onDetectSilence}
                disabled={isDetectingSilence}
                aria-label="Detectar cortes por silencio"
                title={isDetectingSilence ? 'Analizando audio…' : 'Detectar cortes por silencio'}
                className="flex h-10 w-10 items-center justify-center rounded-l-lg border border-r-0 border-border text-text-strong hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-8"
              >
                <AudioWaveform className={`h-4 w-4 ${isDetectingSilence ? 'animate-pulse' : ''}`} />
              </button>
              {silenceThresholdDb !== undefined && silencePaddingMs !== undefined && (
                <details className="relative">
                  <summary
                    title="Opciones de detección de silencio"
                    className="flex h-10 w-6 cursor-pointer list-none items-center justify-center rounded-r-lg border border-border text-xs text-text-muted hover:bg-surface-hover sm:h-8"
                  >
                    ⋯
                  </summary>
                  <div className="absolute right-0 z-30 mt-1 flex w-56 flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-lg">
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                      Umbral de silencio ({silenceThresholdDb} dB)
                      <input
                        type="range"
                        min={-60}
                        max={-20}
                        step={1}
                        value={silenceThresholdDb}
                        onChange={(event) => onSilenceThresholdDbChange?.(Number(event.target.value))}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                      Margen junto a la voz ({(silencePaddingMs / 1000).toFixed(1)}s)
                      <input
                        type="range"
                        min={0}
                        max={2000}
                        step={100}
                        value={silencePaddingMs}
                        onChange={(event) => onSilencePaddingMsChange?.(Number(event.target.value))}
                      />
                    </label>
                  </div>
                </details>
              )}
            </div>
          )}
          {removedSilences.length > 0 && (
            <button
              type="button"
              onClick={() => setSilenceChipsVisible((visible) => !visible)}
              title={silenceChipsVisible ? 'Esconder silencios quitados' : 'Mostrar silencios quitados'}
              aria-label={silenceChipsVisible ? 'Esconder silencios quitados' : 'Mostrar silencios quitados'}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-surface-hover hover:text-text-strong sm:h-8 sm:w-8"
            >
              {silenceChipsVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          )}
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
            onClick={() => zoomTo(Math.max(1, Math.floor(pxPerSec / 2)))}
            aria-label="Reducir zoom"
            title="Reducir zoom (Ctrl/Cmd + scroll también funciona, centrado en el playhead)"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border hover:bg-surface-hover sm:h-8 sm:w-8"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="hidden sm:inline">Zoom</span>
          <button
            type="button"
            onClick={() => zoomTo(Math.max(pxPerSec * 2, pxPerSec + 1))}
            aria-label="Aumentar zoom"
            title="Aumentar zoom (Ctrl/Cmd + scroll también funciona, centrado en el playhead)"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border hover:bg-surface-hover sm:h-8 sm:w-8"
          >
            <Plus className="h-4 w-4" />
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
              disabled={exportAborting}
              className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-text-strong hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 sm:py-1"
            >
              {exportAborting ? 'Cancelando…' : 'Cancelar'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {ERROR_MESSAGES[error]}
        </div>
      )}

      {removedSilences.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSilenceChipsVisible((visible) => !visible)}
            title={silenceChipsVisible ? 'Esconder silencios quitados' : 'Mostrar silencios quitados'}
            aria-label={silenceChipsVisible ? 'Esconder silencios quitados' : 'Mostrar silencios quitados'}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-text-muted hover:bg-surface-hover hover:text-text-strong"
          >
            {silenceChipsVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          {silenceChipsVisible ? (
            <div className="flex flex-nowrap gap-2 overflow-x-auto">
              {removedSilences.map((chip, index) => (
                <div
                  key={chip.segment.clip.id}
                  style={chipProximityStyle(chip.displayOffsetMs, playheadMs)}
                  className="flex shrink-0 items-center gap-2 rounded-md border px-2 py-1 text-xs transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setPlayheadMs(chip.displayOffsetMs)}
                    title="Ir a este punto del timeline"
                    className="hover:text-text-strong"
                  >
                    {formatTimelineMs(chip.displayOffsetMs)} — silencio quitado ({formatTimelineMs(chip.segment.clip.durationMs)})
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestoreSilence?.(index)}
                    title="Revertir este corte"
                    className="text-danger hover:underline"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-text-muted">
              {removedSilences.length} {removedSilences.length === 1 ? 'silencio quitado' : 'silencios quitados'}
            </span>
          )}
        </div>
      )}

      {exporting && exportPhaseLabel && (
        <div role="status" className="rounded-lg bg-accent-bg px-3 py-2 text-sm text-text-strong">
          {exportAborting ? 'Cancelando la exportación…' : `${exportPhaseLabel} (${exportProgress}%)`}
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

      {isClearAllConfirmOpen && (
        <ConfirmDialog
          title="Vaciar timeline"
          message="Se eliminarán todos los clips del timeline. Podés deshacerlo con Ctrl+Z."
          confirmLabel="Vaciar"
          danger
          onConfirm={() => {
            setIsClearAllConfirmOpen(false)
            void clearAllClips()
          }}
          onCancel={() => setIsClearAllConfirmOpen(false)}
        />
      )}

      <div ref={scrollContainerRef} onWheel={handleWheelZoom} className="overflow-x-auto pt-7">
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
              <Scissors className="h-3 w-3" />
            </button>
          )}

          <TimeRuler pxPerSec={pxPerSec} widthPx={contentWidthPx} onClickPosition={(px) => setPlayheadMs(pxToMs(px))} />

          <div
            style={{ left: playheadPx }}
            className="pointer-events-none absolute top-0 z-10 h-full w-0 border-l-2 border-danger"
          >
            <div className="absolute -left-1.5 -top-0 h-3 w-3 rotate-45 bg-danger" />
          </div>

          <div className="relative">
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

            {subtitlesProgressUntilMs != null && (
              <div
                className="pointer-events-none absolute top-2 bottom-0 right-0 z-10 bg-bg/70 transition-[left] duration-300 ease-linear"
                style={{ left: (subtitlesProgressUntilMs / 1000) * pxPerSec }}
              />
            )}

            {activeSubtitleRangeMs && (
              <div
                className="pointer-events-none absolute top-2 bottom-0 z-10 rounded bg-accent/25 ring-2 ring-accent transition-[left,width] duration-200 ease-out"
                style={{
                  left: (activeSubtitleRangeMs.startMs / 1000) * pxPerSec,
                  width: ((activeSubtitleRangeMs.endMs - activeSubtitleRangeMs.startMs) / 1000) * pxPerSec,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
