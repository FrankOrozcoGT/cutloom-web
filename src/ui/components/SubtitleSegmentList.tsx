import { useEffect, useRef, type ChangeEvent } from 'react'
import type { SubtitleSegment } from '@domain/subtitles'
import { formatDurationMs } from '@ui/format'

interface SubtitleSegmentListProps {
  segments: SubtitleSegment[]
  activeSegmentId: string | null
  onSeek: (startMs: number) => void
  onEditText: (segmentId: string, text: string) => void
  onEditTiming: (segmentId: string, startMs: number, endMs: number) => void
}

/** Cuánto se achica cada card por cada posición de distancia al segmento activo, hasta un piso de 0.7. */
const SCALE_STEP = 0.08
const MIN_SCALE = 0.7

function scaleForDistance(distance: number): number {
  return Math.max(MIN_SCALE, 1 - distance * SCALE_STEP)
}

/** Altura máxima del textarea del segmento activo: ~2 líneas de texto (line-height 1.25rem). */
const ACTIVE_TEXTAREA_MAX_HEIGHT_PX = 48

/** Ajusta la altura de la textarea a su contenido (una línea por defecto), topada en 2 líneas; excedente scrollea. */
function autoResize(event: ChangeEvent<HTMLTextAreaElement>): void {
  resizeTextarea(event.target)
}

function resizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, ACTIVE_TEXTAREA_MAX_HEIGHT_PX)}px`
}

interface SegmentTimingFieldsProps {
  segment: SubtitleSegment
  onSeek: (startMs: number) => void
  onEditTiming: (segmentId: string, startMs: number, endMs: number) => void
  compact?: boolean
}

/** Línea única de control: timestamp legible (click = seek) + inputs de edición en ms, en el mismo renglón. */
function SegmentTimingFields({ segment, onSeek, onEditTiming, compact }: SegmentTimingFieldsProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-text-muted">
      <button type="button" onClick={() => onSeek(segment.startMs)} className="shrink-0 hover:text-text-strong">
        {formatDurationMs(segment.startMs)}–{formatDurationMs(segment.endMs)}
      </button>
      {!compact && (
        <>
          <input
            type="number"
            value={segment.startMs}
            onChange={(event) => onEditTiming(segment.id, Number(event.target.value), segment.endMs)}
            className="w-16 rounded border border-border bg-transparent px-1"
          />
          <span>–</span>
          <input
            type="number"
            value={segment.endMs}
            onChange={(event) => onEditTiming(segment.id, segment.startMs, Number(event.target.value))}
            className="w-16 rounded border border-border bg-transparent px-1"
          />
        </>
      )}
    </div>
  )
}

export function SubtitleSegmentList({ segments, activeSegmentId, onSeek, onEditText, onEditTiming }: SubtitleSegmentListProps) {
  const activeCardRef = useRef<HTMLDivElement>(null)
  const activeTextareaRef = useRef<HTMLTextAreaElement>(null)
  const activeIndex = segments.findIndex((segment) => segment.id === activeSegmentId)
  const activeSegment = activeIndex >= 0 ? segments[activeIndex] : null

  useEffect(() => {
    activeCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeSegmentId])

  useEffect(() => {
    const textarea = activeTextareaRef.current
    if (!textarea) return
    resizeTextarea(textarea)
  }, [activeSegment?.id, activeSegment?.text])

  return (
    <div className="flex flex-col gap-2">
      {/* El segmento activo sube acá y se muestra completo: una línea por defecto, hasta 2 líneas antes de scrollear. */}
      {activeSegment && (
        <div className="flex w-full flex-col gap-1 rounded-md border border-accent-border bg-accent-bg p-2 shadow-md">
          <SegmentTimingFields segment={activeSegment} onSeek={onSeek} onEditTiming={onEditTiming} />
          <textarea
            ref={activeTextareaRef}
            value={activeSegment.text}
            onChange={(event) => {
              onEditText(activeSegment.id, event.target.value)
              autoResize(event)
            }}
            rows={1}
            style={{ maxHeight: ACTIVE_TEXTAREA_MAX_HEIGHT_PX }}
            className="w-full resize-none overflow-y-auto rounded border border-border bg-transparent px-2 py-1 text-sm text-text-strong"
          />
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {segments.map((segment, index) => {
          const isActive = segment.id === activeSegmentId
          const distance = activeIndex >= 0 ? Math.abs(index - activeIndex) : 0
          const scale = isActive ? 1 : scaleForDistance(distance)

          return (
            <div
              key={segment.id}
              ref={isActive ? activeCardRef : null}
              onClick={() => onSeek(segment.startMs)}
              style={{ transform: `scale(${scale})`, opacity: isActive ? 0 : scale }}
              className={`flex w-56 shrink-0 origin-center cursor-pointer flex-col gap-1 rounded-md border p-2 transition-[transform,opacity] ${
                isActive ? 'pointer-events-none border-transparent' : 'border-border hover:border-accent-border'
              }`}
            >
              <SegmentTimingFields segment={segment} onSeek={onSeek} onEditTiming={onEditTiming} compact />
              <p className="line-clamp-2 text-sm text-text-strong">{segment.text}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
