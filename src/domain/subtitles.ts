import { err, ok, type Result } from '@application/result'

export interface SubtitleSegment {
  id: string
  text: string
  startMs: number
  endMs: number
}

/** Idiomas soportados para la transcripción manual (input del usuario, Whisper no expone detección con confianza). */
export type LanguageCode = 'es' | 'en'
export const DEFAULT_LANGUAGE: LanguageCode = 'es'

/** Subtítulos del timeline compuesto de un proyecto (uno por proyecto, no por asset). */
export interface Subtitles {
  projectId: string
  segments: SubtitleSegment[]
  language: LanguageCode
}

export type SubtitleTimingError = 'INVALID_TIMING'
export type SubtitleSegmentError = 'SEGMENT_NOT_FOUND'
export type SubtitleParseError = 'PARSE_ERROR'

interface WhisperRawSegment {
  text: string
  start: number
  end: number
}

function isValidTiming(startMs: number, endMs: number): boolean {
  return startMs >= 0 && endMs >= 0 && startMs < endMs
}

let segmentIdCounter = 0
function nextSegmentId(): string {
  segmentIdCounter += 1
  return `seg-${Date.now()}-${segmentIdCounter}`
}

/** Convierte los segmentos crudos de Whisper (segundos) a segmentos de dominio (ms), descartando timings inválidos. */
export function mapWhisperSegments(rawSegments: WhisperRawSegment[]): SubtitleSegment[] {
  const segments: SubtitleSegment[] = []
  for (const raw of rawSegments) {
    const startMs = Math.round(raw.start * 1000)
    const endMs = Math.round(raw.end * 1000)
    const text = raw.text.trim()
    if (!text || !isValidTiming(startMs, endMs)) continue
    segments.push({ id: nextSegmentId(), text, startMs, endMs })
  }
  return segments
}

/** Segmento cuyo rango [startMs, endMs) cubre el timestamp dado, o null si no hay ninguno activo ahí. */
export function findActiveSubtitle(segments: SubtitleSegment[], timeMs: number): SubtitleSegment | null {
  return segments.find((segment) => timeMs >= segment.startMs && timeMs < segment.endMs) ?? null
}

/**
 * Agrupa las palabras de un segmento en cues cortos (~maxCharsPerCue
 * caracteres cada uno, sin cortar palabras) — un SubtitleSegment de Whisper
 * suele cubrir una oración completa, demasiado texto para mostrar de una
 * vez en un frame vertical angosto sin ocupar la pantalla entera.
 */
function groupWordsIntoCues(text: string, maxCharsPerCue: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const cues: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && candidate.length > maxCharsPerCue) {
      cues.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) cues.push(current)
  return cues
}

/**
 * Re-segmenta subtítulos largos en sub-cues cortos con timing proporcional
 * a la cantidad de caracteres de cada uno (aproximación estándar cuando no
 * se tiene el timing real por palabra) — mismo criterio que usan las
 * herramientas de captions profesionales para no mostrar una oración
 * entera de una sola vez. Segmentos que ya caben en maxCharsPerCue quedan
 * intactos (mismo id, sin re-timing).
 */
export function splitLongSubtitleCues(segments: SubtitleSegment[], maxCharsPerCue: number): SubtitleSegment[] {
  const result: SubtitleSegment[] = []
  for (const segment of segments) {
    if (segment.text.length <= maxCharsPerCue) {
      result.push(segment)
      continue
    }
    const cues = groupWordsIntoCues(segment.text, maxCharsPerCue)
    const totalChars = cues.reduce((sum, cue) => sum + cue.length, 0)
    const durationMs = segment.endMs - segment.startMs
    let cursorMs = segment.startMs
    cues.forEach((cueText, index) => {
      const isLast = index === cues.length - 1
      const cueDurationMs = isLast
        ? segment.endMs - cursorMs
        : Math.round((cueText.length / totalChars) * durationMs)
      const cueEndMs = isLast ? segment.endMs : cursorMs + cueDurationMs
      result.push({ id: `${segment.id}-${index}`, text: cueText, startMs: cursorMs, endMs: cueEndMs })
      cursorMs = cueEndMs
    })
  }
  return result
}

export function editSegmentText(
  segments: SubtitleSegment[],
  segmentId: string,
  text: string,
): Result<SubtitleSegment[], SubtitleSegmentError> {
  const index = segments.findIndex((segment) => segment.id === segmentId)
  if (index === -1) return err('SEGMENT_NOT_FOUND')
  const updated = [...segments]
  updated[index] = { ...updated[index], text }
  return ok(updated)
}

export function editSegmentTiming(
  segments: SubtitleSegment[],
  segmentId: string,
  startMs: number,
  endMs: number,
): Result<SubtitleSegment[], SubtitleSegmentError | SubtitleTimingError> {
  const index = segments.findIndex((segment) => segment.id === segmentId)
  if (index === -1) return err('SEGMENT_NOT_FOUND')
  if (!isValidTiming(startMs, endMs)) return err('INVALID_TIMING')
  const updated = [...segments]
  updated[index] = { ...updated[index], startMs, endMs }
  updated.sort((a, b) => a.startMs - b.startMs)
  return ok(updated)
}

function formatSrtTimestamp(ms: number): string {
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const millis = ms % 1000
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`
}

function formatVttTimestamp(ms: number): string {
  return formatSrtTimestamp(ms).replace(',', '.')
}

export function toSrt(segments: SubtitleSegment[]): string {
  return segments
    .map((segment, index) => {
      const order = index + 1
      const timing = `${formatSrtTimestamp(segment.startMs)} --> ${formatSrtTimestamp(segment.endMs)}`
      return `${order}\n${timing}\n${segment.text}\n`
    })
    .join('\n')
    .trim()
}

export function toVtt(segments: SubtitleSegment[]): string {
  const body = segments
    .map((segment) => {
      const timing = `${formatVttTimestamp(segment.startMs)} --> ${formatVttTimestamp(segment.endMs)}`
      return `${timing}\n${segment.text}\n`
    })
    .join('\n')
    .trim()
  return `WEBVTT\n\n${body}`
}

function parseSrtTimestamp(timestamp: string): number | null {
  const match = timestamp.trim().match(/^(\d{2}):(\d{2}):(\d{2})[.,](\d{3})$/)
  if (!match) return null
  const [, hours, minutes, seconds, millis] = match
  return (
    Number(hours) * 3_600_000 + Number(minutes) * 60_000 + Number(seconds) * 1000 + Number(millis)
  )
}

function parseCueBlocks(content: string): { timingLine: string; textLines: string[] }[] {
  const blocks = content.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/)
  const cues: { timingLine: string; textLines: string[] }[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0)
    const timingLineIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingLineIndex === -1) continue
    cues.push({ timingLine: lines[timingLineIndex], textLines: lines.slice(timingLineIndex + 1) })
  }
  return cues
}

function parseCues(content: string): Result<SubtitleSegment[], SubtitleParseError> {
  const cues = parseCueBlocks(content)
  if (cues.length === 0) return err('PARSE_ERROR')

  const segments: SubtitleSegment[] = []
  for (const cue of cues) {
    const [startRaw, endRaw] = cue.timingLine.split('-->').map((part) => part.trim())
    const startMs = parseSrtTimestamp(startRaw)
    const endMs = parseSrtTimestamp(endRaw)
    const text = cue.textLines.join('\n').trim()
    if (startMs === null || endMs === null || !text || !isValidTiming(startMs, endMs)) continue
    segments.push({ id: nextSegmentId(), text, startMs, endMs })
  }

  if (segments.length === 0) return err('PARSE_ERROR')
  return ok(segments)
}

export function importSrt(content: string): Result<SubtitleSegment[], SubtitleParseError> {
  return parseCues(content)
}

export function importVtt(content: string): Result<SubtitleSegment[], SubtitleParseError> {
  return parseCues(content)
}

