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

/**
 * Huella determinista del contenido editable del timeline (no de metadata
 * como ids de track) — cambia si se corta, mueve, inserta o borra un clip.
 * Se usa para detectar si un timeline cambió desde que se generaron unos
 * shorts, ya que sus startMs/endMs quedan fijados al momento de creación y
 * dejan de corresponder al contenido real si el timeline se edita después.
 */
export function timelineFingerprint(timeline: Timeline): string {
  const clipsSignature = timeline.tracks
    .map((track) =>
      track.clips
        .map((clip) => `${clip.assetId}:${clip.offsetMs}:${clip.durationMs}:${clip.sourceStartMs}`)
        .join(','),
    )
    .join('|')
  return clipsSignature
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
 *
 * El rango pedido puede extenderse más allá del clip activo en startMs (p.ej.
 * un hueco de silencio calculado sobre subtítulos que llega hasta un punto sin
 * clip, o hasta la frontera con el siguiente). En ese caso solo se quita hasta
 * el final real del clip — no hay nada más que cortar, y el desplazamiento
 * usa el ancho realmente quitado, no el del rango pedido, para no descuadrar
 * los offsets de lo que viene después.
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
  const actualEndMs = Math.min(endMs, clipEndMs)
  if (actualEndMs < clipEndMs) {
    const splitEnd = splitClip(working, afterStart.clip.id, actualEndMs)
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

  const closed = shiftClipsFrom(withoutSegment, actualEndMs, -(actualEndMs - startMs))
  return ok({ timeline: closed, removed })
}

/**
 * Aplica varios cortes [startMs, endMs) sobre el mismo timeline en memoria,
 * uno tras otro (reusando removeSegment, sin duplicar su lógica), y devuelve
 * el timeline final junto con cada segmento quitado. Pensado para que el
 * caller haga un único applyNewTimeline con el resultado — todo el lote
 * entra como un solo paso de historial, no uno por corte. Un corte que no
 * encuentra clip activo (cae en una zona vacía del timeline) se saltea en
 * vez de abortar el lote completo.
 */
export function removeSegments(
  timeline: Timeline,
  cuts: { startMs: number; endMs: number }[],
): { timeline: Timeline; removed: RemovedSegment[] } {
  let working = timeline
  const removed: RemovedSegment[] = []
  for (const cut of cuts) {
    const result = removeSegment(working, cut.startMs, cut.endMs)
    if (!result.ok) continue
    working = result.value.timeline
    removed.push(result.value.removed)
  }
  return { timeline: working, removed }
}

/**
 * Revierte el corte producido por removeSegment: abre un hueco y reinserta el
 * clip quitado ahí. `atMs` es la posición ACTUAL del hueco en el timeline
 * vigente, no `removed.clip.offsetMs` — esa es la posición original del
 * corte, que queda desactualizada si hubo otros cortes o reinserciones
 * después (desplazan todo lo que viene detrás). El caller es responsable de
 * rastrear la posición actual de cada corte pendiente de revertir.
 */
export function reinsertSegment(timeline: Timeline, removed: RemovedSegment, atMs: number): Timeline {
  const opened = shiftClipsFrom(timeline, atMs, removed.clip.durationMs)
  const relocated: Clip = { ...removed.clip, offsetMs: atMs }
  const updatedTracks = opened.tracks.map((track) =>
    track.id === removed.trackId ? { ...track, clips: mergeWithNeighbors(track.clips, relocated) } : track,
  )
  return { ...opened, tracks: updatedTracks }
}

/** Dos clips son el mismo material continuo si uno retoma el video fuente justo donde el otro lo dejó — el caso típico tras reinsertar un tramo que removeSegment había aislado partiendo un clip original en izquierda/segmento/derecha. */
function areContiguous(left: Clip, right: Clip): boolean {
  return (
    left.assetId === right.assetId &&
    left.offsetMs + left.durationMs === right.offsetMs &&
    left.sourceStartMs + left.durationMs === right.sourceStartMs
  )
}

/**
 * Recose el clip recién reinsertado con su vecino inmediato anterior y/o
 * posterior si son en realidad el mismo material que removeSegment había
 * partido. A propósito NO recorre el resto del track: dos clips ajenos al
 * corte que un usuario haya colocado pegados a mano podrían calzar por
 * casualidad en offset y sourceStartMs — fusionar solo contra los vecinos
 * directos del clip que se está reinsertando acota el caso a la situación
 * real que esta función resuelve.
 */
function mergeWithNeighbors(clips: Clip[], relocated: Clip): Clip[] {
  const withRelocated = [...clips, relocated].sort((a, b) => a.offsetMs - b.offsetMs)
  const index = withRelocated.findIndex((clip) => clip.id === relocated.id)

  let merged = relocated
  const before = withRelocated[index - 1]
  if (before && areContiguous(before, merged)) {
    merged = { ...before, durationMs: before.durationMs + merged.durationMs }
  }
  const after = withRelocated[index + 1]
  if (after && areContiguous(merged, after)) {
    merged = { ...merged, durationMs: merged.durationMs + after.durationMs }
  }

  return withRelocated
    .filter((clip) => clip.id !== before?.id && clip.id !== relocated.id && clip.id !== after?.id)
    .concat(merged)
}

export interface SilenceCut {
  startMs: number
  endMs: number
}

const DEFAULT_SILENCE_THRESHOLD_DB = -40
const DEFAULT_MIN_SILENCE_MS = 700
/** Margen de silencio que se deja pegado a la voz en cada extremo, en vez de cortar justo al borde — evita micro-clips cuando dos voces están muy cerca. */
const DEFAULT_PADDING_MS = 1000
const RMS_WINDOW_MS = 20

function dbToAmplitude(db: number): number {
  return 10 ** (db / 20)
}

function findRawSilences(audio: Float32Array, sampleRate: number, thresholdAmplitude: number, minSilenceMs: number): SilenceCut[] {
  const windowSize = Math.max(1, Math.round((RMS_WINDOW_MS / 1000) * sampleRate))
  const cuts: SilenceCut[] = []
  let silenceStartSample: number | null = null

  const pushIfLongEnough = (startSample: number, endSample: number) => {
    const startMs = (startSample / sampleRate) * 1000
    const endMs = (endSample / sampleRate) * 1000
    if (endMs - startMs >= minSilenceMs) {
      cuts.push({ startMs, endMs })
    }
  }

  for (let start = 0; start < audio.length; start += windowSize) {
    const end = Math.min(start + windowSize, audio.length)
    let sumSquares = 0
    for (let i = start; i < end; i += 1) {
      sumSquares += audio[i] * audio[i]
    }
    const rms = Math.sqrt(sumSquares / (end - start))
    const isSilent = rms < thresholdAmplitude

    if (isSilent && silenceStartSample === null) {
      silenceStartSample = start
    } else if (!isSilent && silenceStartSample !== null) {
      pushIfLongEnough(silenceStartSample, start)
      silenceStartSample = null
    }
  }

  if (silenceStartSample !== null) {
    pushIfLongEnough(silenceStartSample, audio.length)
  }

  return cuts
}

/**
 * Detecta tramos de silencio real en el audio (RMS por ventana bajo un
 * umbral en dB, sostenido al menos minSilenceMs) — el mismo enfoque que usan
 * los editores reales (Descript, AutoCut, Premiere): analizar el volumen del
 * audio directamente, no depender de que exista una transcripción. audio es
 * mono a sampleRate (coherente con TARGET_SAMPLE_RATE de domain/shorts.ts,
 * que es lo que produce la extracción de audio del timeline).
 *
 * Cada silencio detectado se acorta por paddingMs de cada lado antes de
 * devolverlo — el corte deja ese margen de silencio pegado a la voz en vez de
 * cortar justo al borde, para no dejar clips de voz microscópicos entre dos
 * silencios muy próximos. Si el padding de dos silencios consecutivos se
 * solaparía, se fusionan en un solo corte (sigue siendo solo el padding
 * pedido, no el doble).
 */
export function detectSilenceCuts(
  audio: Float32Array,
  sampleRate: number,
  options: { thresholdDb?: number; minSilenceMs?: number; paddingMs?: number } = {},
): SilenceCut[] {
  const thresholdAmplitude = dbToAmplitude(options.thresholdDb ?? DEFAULT_SILENCE_THRESHOLD_DB)
  const minSilenceMs = options.minSilenceMs ?? DEFAULT_MIN_SILENCE_MS
  const paddingMs = options.paddingMs ?? DEFAULT_PADDING_MS

  const rawSilences = findRawSilences(audio, sampleRate, thresholdAmplitude, minSilenceMs)

  const padded = rawSilences
    .map((cut) => ({ startMs: cut.startMs + paddingMs, endMs: cut.endMs - paddingMs }))
    .filter((cut) => cut.endMs > cut.startMs)

  const merged: SilenceCut[] = []
  for (const cut of padded) {
    const last = merged[merged.length - 1]
    if (last && cut.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, cut.endMs)
    } else {
      merged.push({ ...cut })
    }
  }

  return merged
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

/** Vacía todos los clips de todas las pistas, manteniendo la estructura de pistas existente. */
export function clearAllClips(timeline: Timeline): Timeline {
  return { ...timeline, tracks: timeline.tracks.map((track) => ({ ...track, clips: [] })) }
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
