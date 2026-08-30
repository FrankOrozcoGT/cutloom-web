import { err, ok, type Result } from '@application/result'

export const SNAP_THRESHOLD_MS = 250
const EPSILON_MS = 1

export interface Clip {
  id: string
  assetId: string
  durationMs: number
  offsetMs: number
  /** Punto de inicio dentro del video fuente (ms). Permite recortar sin perder el resto del material. */
  sourceStartMs: number
}

export interface Track {
  id: string
  clips: Clip[]
}

export interface Timeline {
  id: string
  projectId: string
  tracks: Track[]
}

export type InvalidClipError = 'INVALID_DURATION' | 'INVALID_OFFSET'
export type OverlapError = 'OVERLAP'
export type TrackFullError = 'TRACK_FULL'
export type ClipNotFoundError = 'CLIP_NOT_FOUND'
export type TrackNotFoundError = 'TRACK_NOT_FOUND'
export type TrimError = 'TRIM_EXCEEDS_SOURCE'
export type CutClipError = 'CUT_OUT_OF_BOUNDS' | 'CUT_ZERO_LENGTH'

export type TrimEdge = 'start' | 'end'

export function createClip(
  assetId: string,
  durationMs: number,
  offsetMs: number,
  sourceStartMs = 0,
): Result<Clip, InvalidClipError> {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return err('INVALID_DURATION')
  }
  if (!Number.isFinite(offsetMs) || offsetMs < 0) {
    return err('INVALID_OFFSET')
  }
  if (!Number.isFinite(sourceStartMs) || sourceStartMs < 0) {
    return err('INVALID_OFFSET')
  }
  return ok({ id: crypto.randomUUID(), assetId, durationMs, offsetMs, sourceStartMs })
}

export function createTrack(): Track {
  return { id: crypto.randomUUID(), clips: [] }
}

export function createTimeline(projectId: string): Timeline {
  return { id: crypto.randomUUID(), projectId, tracks: [] }
}

function clipEnd(clip: Clip): number {
  return clip.offsetMs + clip.durationMs
}

export interface ActiveClip {
  clip: Clip
  trackId: string
  /** Posición dentro del video fuente que corresponde al playhead actual (ms). */
  sourceTimeMs: number
}

/**
 * Devuelve el clip que debe reproducirse en playheadMs, agrupando todas las
 * pistas en una sola línea de tiempo: la primera pista con un clip cubriendo
 * ese instante gana. Null si ninguna pista tiene contenido ahí (silencio/vacío).
 */
export function findActiveClip(timeline: Timeline, playheadMs: number): ActiveClip | null {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((c) => playheadMs >= c.offsetMs && playheadMs < clipEnd(c))
    if (clip) {
      return { clip, trackId: track.id, sourceTimeMs: clip.sourceStartMs + (playheadMs - clip.offsetMs) }
    }
  }
  return null
}

/** Duración total del timeline: el punto donde termina el último clip de cualquier pista. */
export function getTimelineDurationMs(timeline: Timeline): number {
  return Math.max(0, ...timeline.tracks.flatMap((track) => track.clips.map(clipEnd)))
}

/** Busca un clip por id en cualquier pista del timeline. */
export function findClipById(timeline: Timeline, clipId: string): Clip | null {
  return timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId) ?? null
}

/** Clip que sigue inmediatamente después de currentClipId en la línea de tiempo unificada, para precargarlo. */
export function findNextClip(timeline: Timeline, currentClipId: string): Clip | null {
  const current = timeline.tracks.flatMap((track) => track.clips).find((c) => c.id === currentClipId)
  if (!current) return null

  const currentEnd = clipEnd(current)
  const candidates = timeline.tracks
    .flatMap((track) => track.clips)
    .filter((c) => c.id !== currentClipId && c.offsetMs >= currentEnd)
    .sort((a, b) => a.offsetMs - b.offsetMs)

  return candidates[0] ?? null
}

/**
 * Primer clip que empieza después de playheadMs, en la línea de tiempo
 * unificada. A diferencia de findNextClip, no depende de un clip activo —
 * sirve para encontrar qué viene después mientras el playhead está en un
 * hueco (sin ningún clip cubriendo ese instante).
 */
export function findClipAfter(timeline: Timeline, playheadMs: number): Clip | null {
  const candidates = timeline.tracks
    .flatMap((track) => track.clips)
    .filter((c) => c.offsetMs > playheadMs)
    .sort((a, b) => a.offsetMs - b.offsetMs)

  return candidates[0] ?? null
}

export function detectOverlap(a: Pick<Clip, 'offsetMs' | 'durationMs'>, b: Pick<Clip, 'offsetMs' | 'durationMs'>): boolean {
  const aStart = a.offsetMs
  const aEnd = a.offsetMs + a.durationMs
  const bStart = b.offsetMs
  const bEnd = b.offsetMs + b.durationMs
  return aStart < bEnd - EPSILON_MS && bStart < aEnd - EPSILON_MS
}

export function clipOverlapsTrackSegment(track: Track, offsetMs: number, durationMs: number, ignoreClipId?: string): boolean {
  const segment = { offsetMs, durationMs }
  return track.clips.some((clip) => clip.id !== ignoreClipId && detectOverlap(clip, segment))
}

/** IDs de los clips de una pista que se superponen con al menos otro clip de la misma pista, para resaltarlos como conflicto. */
export function findOverlappingClipIds(track: Track): Set<string> {
  const overlapping = track.clips.filter((clip, index) =>
    track.clips.some((other, otherIndex) => otherIndex !== index && detectOverlap(clip, other)),
  )
  return new Set(overlapping.map((clip) => clip.id))
}

export function findValidTrack(
  timeline: Timeline,
  clip: Pick<Clip, 'offsetMs' | 'durationMs'>,
  preferredTrackId?: string,
): Track | null {
  if (preferredTrackId) {
    const preferred = timeline.tracks.find((track) => track.id === preferredTrackId)
    if (preferred && !clipOverlapsTrackSegment(preferred, clip.offsetMs, clip.durationMs)) {
      return preferred
    }
  }
  return timeline.tracks.find((track) => !clipOverlapsTrackSegment(track, clip.offsetMs, clip.durationMs)) ?? null
}

/**
 * Ajusta offsetMs al punto de snap válido más cercano dentro de SNAP_THRESHOLD_MS.
 * Igual que en editores profesionales (Premiere, DaVinci): el snap magnetiza
 * contra los bordes de los clips de TODAS las pistas (no solo la pista destino)
 * y contra el playhead, no solo contra los vecinos de la misma pista — eso es
 * lo que permite alinear clips entre pistas distintas y con el punto de edición.
 * Compara la distancia real a cada candidato en vez de quedarse con el último
 * candidato iterado.
 */
export function snapToNearestClip(
  timeline: Timeline,
  offsetMs: number,
  durationMs: number,
  options: { ignoreClipId?: string; playheadMs?: number } = {},
): number {
  const { ignoreClipId, playheadMs } = options

  const candidates: number[] = [0]
  for (const track of timeline.tracks) {
    for (const neighbor of track.clips) {
      if (neighbor.id === ignoreClipId) continue
      candidates.push(neighbor.offsetMs, clipEnd(neighbor))
    }
  }
  if (playheadMs !== undefined) {
    candidates.push(playheadMs)
  }

  let bestOffset = offsetMs
  let bestDistance = Infinity

  for (const point of candidates) {
    // El clip puede alinear su borde inicial o su borde final con este punto.
    const startAligned = point
    const endAligned = point - durationMs

    for (const candidateOffset of [startAligned, endAligned]) {
      if (candidateOffset < 0) continue
      const distance = Math.abs(candidateOffset - offsetMs)
      if (distance <= SNAP_THRESHOLD_MS && distance < bestDistance) {
        bestDistance = distance
        bestOffset = candidateOffset
      }
    }
  }

  return Math.max(0, bestOffset)
}

export function addClipToTrack(
  timeline: Timeline,
  clip: Clip,
  trackId: string,
): Result<Timeline, OverlapError | TrackFullError | InvalidClipError | TrackNotFoundError> {
  if (!Number.isFinite(clip.durationMs) || clip.durationMs <= 0) {
    return err('INVALID_DURATION')
  }
  if (!Number.isFinite(clip.offsetMs) || clip.offsetMs < 0) {
    return err('INVALID_OFFSET')
  }

  const track = timeline.tracks.find((t) => t.id === trackId)
  if (!track) {
    return err('TRACK_NOT_FOUND')
  }

  const snappedOffset = snapToNearestClip(timeline, clip.offsetMs, clip.durationMs)
  const snappedClip = { ...clip, offsetMs: snappedOffset }

  if (clipOverlapsTrackSegment(track, snappedClip.offsetMs, snappedClip.durationMs)) {
    return err('OVERLAP')
  }

  const updatedTracks = timeline.tracks.map((t) =>
    t.id === trackId ? { ...t, clips: [...t.clips, snappedClip] } : t,
  )

  return ok({ ...timeline, tracks: updatedTracks })
}

export function moveClip(
  timeline: Timeline,
  clipId: string,
  newTrackId: string,
  newOffsetMs: number,
): Result<Timeline, OverlapError | ClipNotFoundError | InvalidClipError | TrackNotFoundError> {
  let found: Clip | null = null
  for (const track of timeline.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) {
      found = clip
      break
    }
  }
  if (!found) {
    return err('CLIP_NOT_FOUND')
  }

  if (!Number.isFinite(newOffsetMs) || newOffsetMs < 0) {
    return err('INVALID_OFFSET')
  }

  const newTrack = timeline.tracks.find((t) => t.id === newTrackId)
  if (!newTrack) {
    return err('TRACK_NOT_FOUND')
  }

  const snappedOffset = snapToNearestClip(timeline, newOffsetMs, found.durationMs, { ignoreClipId: clipId })

  if (clipOverlapsTrackSegment(newTrack, snappedOffset, found.durationMs, clipId)) {
    return err('OVERLAP')
  }

  const movedClip = { ...found, offsetMs: snappedOffset }

  const updatedTracks = timeline.tracks.map((track) => {
    const withoutClip = track.clips.filter((c) => c.id !== clipId)
    if (track.id === newTrackId) {
      return { ...track, clips: [...withoutClip, movedClip] }
    }
    return { ...track, clips: withoutClip }
  })

  return ok({ ...timeline, tracks: updatedTracks })
}

/**
 * Divide un clip en dos segmentos independientes en cutPointMs (absoluto en
 * el timeline). El segmento 1 conserva sourceStartMs original; el segmento 2
 * avanza sourceStartMs exactamente el delta cortado, para no perder frames.
 */
export function splitClip(
  timeline: Timeline,
  clipId: string,
  cutPointMs: number,
): Result<Timeline, ClipNotFoundError | CutClipError> {
  let trackWithClip: Track | null = null
  let clip: Clip | null = null
  for (const track of timeline.tracks) {
    const found = track.clips.find((c) => c.id === clipId)
    if (found) {
      trackWithClip = track
      clip = found
      break
    }
  }
  if (!trackWithClip || !clip) {
    return err('CLIP_NOT_FOUND')
  }

  if (!Number.isFinite(cutPointMs) || cutPointMs < 0) {
    return err('CUT_OUT_OF_BOUNDS')
  }

  const end = clipEnd(clip)
  if (cutPointMs === clip.offsetMs || cutPointMs === end) {
    return err('CUT_ZERO_LENGTH')
  }
  if (cutPointMs < clip.offsetMs || cutPointMs > end) {
    return err('CUT_OUT_OF_BOUNDS')
  }

  const deltaMs = cutPointMs - clip.offsetMs
  const segment1: Clip = { ...clip, durationMs: deltaMs }
  const segment2: Clip = {
    id: crypto.randomUUID(),
    assetId: clip.assetId,
    offsetMs: cutPointMs,
    durationMs: end - cutPointMs,
    sourceStartMs: clip.sourceStartMs + deltaMs,
  }

  const updatedTracks = timeline.tracks.map((track) =>
    track.id === trackWithClip!.id
      ? { ...track, clips: track.clips.flatMap((c) => (c.id === clipId ? [segment1, segment2] : [c])) }
      : track,
  )

  return ok({ ...timeline, tracks: updatedTracks })
}

/** Desplaza offsetMs por deltaMs en todos los clips que empiezan en o después de fromMs, en todas las pistas — el mismo recorrido que usan removeSegment y reinsertSegment para cerrar/abrir el hueco que dejan. */
function shiftClipsFrom(timeline: Timeline, fromMs: number, deltaMs: number): Timeline {
  const updatedTracks = timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => (clip.offsetMs >= fromMs ? { ...clip, offsetMs: clip.offsetMs + deltaMs } : clip)),
  }))
  return { ...timeline, tracks: updatedTracks }
}

export interface RemovedSegment {
  clip: Clip
  trackId: string
}

/**
 * Quita el tramo [startMs, endMs) del timeline y recorre hacia atrás todo lo
 * que viene después, cerrando el hueco (a diferencia de deleteClip, que deja
 * un hueco). Usa splitClip en ambos extremos para aislar el tramo exacto sin
 * duplicar su lógica de partir un clip. Devuelve el clip quitado junto con su
 * pista original — reinsertSegment lo usa para revertir exactamente este
 * corte, sin afectar otros cortes aplicados después.
 */
export function removeSegment(
  timeline: Timeline,
  startMs: number,
  endMs: number,
): Result<{ timeline: Timeline; removed: RemovedSegment }, ClipNotFoundError | CutClipError> {
  const active = findActiveClip(timeline, startMs)
  if (!active) return err('CLIP_NOT_FOUND')

  let working = timeline
  if (startMs > active.clip.offsetMs) {
    const splitStart = splitClip(working, active.clip.id, startMs)
    if (!splitStart.ok) return splitStart
    working = splitStart.value
  }

  const afterStart = findActiveClip(working, startMs)
  if (!afterStart) return err('CLIP_NOT_FOUND')

  const clipEndMs = afterStart.clip.offsetMs + afterStart.clip.durationMs
  if (endMs < clipEndMs) {
    const splitEnd = splitClip(working, afterStart.clip.id, endMs)
    if (!splitEnd.ok) return splitEnd
    working = splitEnd.value
  }

  const segment = findActiveClip(working, startMs)
  if (!segment) return err('CLIP_NOT_FOUND')

  const removed: RemovedSegment = { clip: segment.clip, trackId: segment.trackId }
  const withoutSegment: Timeline = {
    ...working,
    tracks: working.tracks.map((track) =>
      track.id === segment.trackId ? { ...track, clips: track.clips.filter((c) => c.id !== segment.clip.id) } : track,
    ),
  }

  const closed = shiftClipsFrom(withoutSegment, endMs, -(endMs - startMs))
  return ok({ timeline: closed, removed })
}

/** Revierte exactamente el corte producido por removeSegment: abre de nuevo el hueco y reinserta el clip quitado en su lugar original. */
export function reinsertSegment(timeline: Timeline, removed: RemovedSegment): Timeline {
  const opened = shiftClipsFrom(timeline, removed.clip.offsetMs, removed.clip.durationMs)
  const updatedTracks = opened.tracks.map((track) =>
    track.id === removed.trackId ? { ...track, clips: [...track.clips, removed.clip] } : track,
  )
  return { ...opened, tracks: updatedTracks }
}

/** Quita el clip seleccionado del timeline, dejando un hueco en su lugar (no recorre el resto hacia atrás). */
export function deleteClip(timeline: Timeline, clipId: string): Result<Timeline, ClipNotFoundError> {
  const hasClip = timeline.tracks.some((track) => track.clips.some((clip) => clip.id === clipId))
  if (!hasClip) {
    return err('CLIP_NOT_FOUND')
  }

  const updatedTracks = timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.id !== clipId),
  }))

  return ok({ ...timeline, tracks: updatedTracks })
}

/** Quita del timeline todos los clips que referencian assetId, para cuando su VideoAsset se borra. */
export function removeClipsByAsset(timeline: Timeline, assetId: string): Timeline {
  const updatedTracks = timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.assetId !== assetId),
  }))

  return { ...timeline, tracks: updatedTracks }
}

const MIN_CLIP_DURATION_MS = 100

/**
 * Recorta un clip desde uno de sus bordes. El borde 'start' mueve offsetMs y
 * sourceStartMs juntos (el punto de inicio en el video fuente avanza/retrocede
 * con el borde); el borde 'end' solo ajusta durationMs. sourceDurationMs acota
 * cuánto material del asset original queda disponible para el recorte.
 */
export function resizeClip(
  timeline: Timeline,
  clipId: string,
  edge: TrimEdge,
  newBoundaryMs: number,
  sourceDurationMs: number,
): Result<Timeline, OverlapError | ClipNotFoundError | InvalidClipError | TrimError> {
  let trackWithClip: Track | null = null
  let clip: Clip | null = null
  for (const track of timeline.tracks) {
    const found = track.clips.find((c) => c.id === clipId)
    if (found) {
      trackWithClip = track
      clip = found
      break
    }
  }
  if (!trackWithClip || !clip) {
    return err('CLIP_NOT_FOUND')
  }

  if (!Number.isFinite(newBoundaryMs)) {
    return err('INVALID_OFFSET')
  }

  let nextClip: Clip
  if (edge === 'start') {
    const clipEndMs = clip.offsetMs + clip.durationMs
    const boundedStart = Math.max(0, Math.min(newBoundaryMs, clipEndMs - MIN_CLIP_DURATION_MS))
    const deltaMs = boundedStart - clip.offsetMs
    const newSourceStart = clip.sourceStartMs + deltaMs
    if (newSourceStart < 0) {
      return err('TRIM_EXCEEDS_SOURCE')
    }
    nextClip = {
      ...clip,
      offsetMs: boundedStart,
      durationMs: clipEndMs - boundedStart,
      sourceStartMs: newSourceStart,
    }
  } else {
    const minEnd = clip.offsetMs + MIN_CLIP_DURATION_MS
    const boundedEnd = Math.max(minEnd, newBoundaryMs)
    const newDuration = boundedEnd - clip.offsetMs
    if (clip.sourceStartMs + newDuration > sourceDurationMs) {
      return err('TRIM_EXCEEDS_SOURCE')
    }
    nextClip = { ...clip, durationMs: newDuration }
  }

  if (nextClip.durationMs <= 0) {
    return err('INVALID_DURATION')
  }

  if (clipOverlapsTrackSegment(trackWithClip, nextClip.offsetMs, nextClip.durationMs, clipId)) {
    return err('OVERLAP')
  }

  const updatedTracks = timeline.tracks.map((track) =>
    track.id === trackWithClip!.id
      ? { ...track, clips: track.clips.map((c) => (c.id === clipId ? nextClip : c)) }
      : track,
  )

  return ok({ ...timeline, tracks: updatedTracks })
}
