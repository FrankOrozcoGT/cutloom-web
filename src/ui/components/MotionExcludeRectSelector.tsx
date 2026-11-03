import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Render } from '@domain/render'
import type { NormalizedRect } from '@domain/shorts'
import { useRenderFrame } from '@ui/timeline/useRenderFrame'
import { useObjectUrl } from '@ui/hooks/useObjectUrl'

interface MotionExcludeRectSelectorProps {
  render: Render
  rect: NormalizedRect | null
  onChange: (rect: NormalizedRect | null) => void
  onClose: () => void
}

function normalizeDrag(startX: number, startY: number, endX: number, endY: number): NormalizedRect {
  const x = Math.min(startX, endX)
  const y = Math.min(startY, endY)
  return { x, y, width: Math.abs(endX - startX), height: Math.abs(endY - startY) }
}

/**
 * Deja al usuario dibujar, arrastrando con el mouse sobre un frame estático
 * del render completo, el rectángulo (en coordenadas normalizadas 0-1) a
 * excluir del análisis de auto-encuadre — reemplaza cualquier posición
 * predefinida porque el avatar/webcam puede estar en cualquier lado, de
 * cualquier tamaño, según cómo haya grabado cada usuario.
 */
export function MotionExcludeRectSelector({ render, rect, onChange, onClose }: MotionExcludeRectSelectorProps) {
  const renderUrl = useObjectUrl(render.blob)
  const [durationMs, setDurationMs] = useState(0)
  const [selectedAtMs, setSelectedAtMs] = useState(0)
  const frameUrl = useRenderFrame(render, selectedAtMs)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)

  // Lee la duración real del render con un <video> oculto (nunca se reproduce,
  // solo carga metadata) — así el slider de abajo puede cubrir todo el rango
  // real en vez de un valor inventado, y el usuario puede ir a cualquier
  // punto del video (no solo el primer frame) para marcar el avatar en un
  // momento donde efectivamente se lo vea.
  useEffect(() => {
    if (!renderUrl) return
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = renderUrl
    const handleLoadedMetadata = () => setDurationMs(Math.round(video.duration * 1000))
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata)
  }, [renderUrl])

  const toNormalized = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return null
    return {
      x: Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height)),
    }
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const point = toNormalized(event.clientX, event.clientY)
      if (!point) return
      setDragStart(point)
      setDragCurrent(point)
    },
    [toNormalized],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart) return
      const point = toNormalized(event.clientX, event.clientY)
      if (point) setDragCurrent(point)
    },
    [dragStart, toNormalized],
  )

  const handlePointerUp = useCallback(() => {
    if (dragStart && dragCurrent) {
      const drawn = normalizeDrag(dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y)
      // Un arrastre casi nulo (click simple) no define un rectángulo útil — se descarta en vez de guardar un recuadro de tamaño cero.
      if (drawn.width > 0.02 && drawn.height > 0.02) {
        onChange(drawn)
      }
    }
    setDragStart(null)
    setDragCurrent(null)
  }, [dragStart, dragCurrent, onChange])

  const liveRect = dragStart && dragCurrent ? normalizeDrag(dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y) : rect

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-w-2xl flex-col gap-3 rounded-lg bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-strong">Marca la región del avatar/webcam a ignorar</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-text-muted hover:text-text-strong">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-text-muted">
          Mueve el video hasta un momento donde se vea bien tu avatar o webcam, y arrastra sobre la imagen para dibujar el recuadro. Esa zona se ignora al calcular hacia dónde se mueve el encuadre automático.
        </p>

        {durationMs > 0 && (
          <input
            type="range"
            min={0}
            max={durationMs}
            step={100}
            value={selectedAtMs}
            onChange={(event) => setSelectedAtMs(Number(event.target.value))}
            className="w-full"
          />
        )}

        <div
          ref={containerRef}
          className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded bg-black select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {frameUrl && <img src={frameUrl} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />}
          {liveRect && (
            <div
              className="absolute border-2 border-accent bg-accent/20"
              style={{
                left: `${liveRect.x * 100}%`,
                top: `${liveRect.y * 100}%`,
                width: `${liveRect.width * 100}%`,
                height: `${liveRect.height * 100}%`,
              }}
            />
          )}
        </div>

        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={!rect}
            className="text-xs text-text-muted underline hover:text-text-strong disabled:opacity-50"
          >
            Quitar región marcada
          </button>
          <button type="button" onClick={onClose} className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white">
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
