import { useEffect, useRef, type ChangeEvent } from 'react'
import type { SubtitleSegment } from '@domain/subtitles'
import { formatDurationMs } from '@ui/format'

interface SubtitleSegmentListProps {
  segments: SubtitleSegment[]
  activeSegmentId: string | null
  onSeek: (startMs: number) => void
  onEditText: (segmentId: string, text: string) => void
  onEditTiming: (segmentId: string, startMs: number, endMs: number) => void
  /** segmentId -> texto original, para los segmentos que la mejora de IA cambió y todavía no se revirtieron ni se les volvió a editar el texto a mano. */
  pendingDiffs: Record<string, string>
  onRevertSegment: (segmentId: string) => void
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

type DiffOp = { kind: 'same' | 'removed' | 'added'; text: string }

/**
 * Diff palabra por palabra (LCS) entre el texto original y el corregido —
 * alcanza para mostrar qué cambió una mejora de IA en una oración corta de
 * subtítulo, sin traer una librería de diff completa para esto.
 */
function diffWords(original: string, corrected: string): DiffOp[] {
  const a = original.split(/(\s+)/)
  const b = corrected.split(/(\s+)/)
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ kind: 'removed', text: a[i] })
      i += 1
    } else {
      ops.push({ kind: 'added', text: b[j] })
      j += 1
    }
  }
  while (i < a.length) {
    ops.push({ kind: 'removed', text: a[i] })
    i += 1
  }
  while (j < b.length) {
    ops.push({ kind: 'added', text: b[j] })
    j += 1
  }
  return ops
}

function SegmentDiff({ original, corrected }: { original: string; corrected: string }) {
  const ops = diffWords(original, corrected)
  return (
    <p className="text-sm">
      {ops.map((op, index) => {
        if (op.kind === 'same') return <span key={index}>{op.text}</span>
        if (op.kind === 'removed') {
          return (
            <span key={index} className="text-danger line-through">
              {op.text}
            </span>
          )
        }
        return (
          <span key={index} className="text-success">
            {op.text}
          </span>
        )
      })}
    </p>
  )
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

export function SubtitleSegmentList({
  segments,
  activeSegmentId,
  onSeek,
  onEditText,
  onEditTiming,
  pendingDiffs,
  onRevertSegment,
}: SubtitleSegmentListProps) {
  const activeCardRef = useRef<HTMLDivElement>(null)
  const activeTextareaRef = useRef<HTMLTextAreaElement>(null)
  const activeIndex = segments.findIndex((segment) => segment.id === activeSegmentId)
  const activeSegment = activeIndex >= 0 ? segments[activeIndex] : null
  const activeDiff = activeSegment ? pendingDiffs[activeSegment.id] : undefined

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
          {activeDiff !== undefined ? (
            <div className="flex flex-col gap-1">
              <SegmentDiff original={activeDiff} corrected={activeSegment.text} />
              <button
                type="button"
                onClick={() => onRevertSegment(activeSegment.id)}
                className="self-start text-xs text-danger hover:underline"
              >
                Revertir a como estaba
              </button>
            </div>
          ) : (
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
          )}
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {segments.map((segment, index) => {
          const isActive = segment.id === activeSegmentId
          const distance = activeIndex >= 0 ? Math.abs(index - activeIndex) : 0
          const scale = isActive ? 1 : scaleForDistance(distance)
          const diffOriginal = pendingDiffs[segment.id]

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
              {diffOriginal !== undefined ? (
                <div className="line-clamp-2 text-sm">
                  <SegmentDiff original={diffOriginal} corrected={segment.text} />
                </div>
              ) : (
                <p className="line-clamp-2 text-sm text-text-strong">{segment.text}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
