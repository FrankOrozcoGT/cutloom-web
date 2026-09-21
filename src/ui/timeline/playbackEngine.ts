import { findActiveClip, findClipAfter, findNextClip, getTimelineDurationMs, type Timeline } from '@domain/timeline'

export type PlaybackMode = 'clip' | 'gap' | 'ended'

type UpcomingClip = { id: string; assetId: string; sourceStartMs: number; offsetMs: number }

export interface PlaybackSnapshot {
  mode: PlaybackMode
  durationMs: number
  activeClip: {
    id: string
    assetId: string
    sourceTimeMs: number
    sourceStartMs: number
    offsetMs: number
    durationMs: number
  } | null
  /** Clip precargado en el slot en espera: el siguiente tras el activo (modo 'clip'), o el que sigue al hueco (modo 'gap'). */
  waitingClip: UpcomingClip | null
}

/**
 * Deriva, de forma pura, qué debería estar pasando en la reproducción dado el
 * estado actual del timeline y el playhead. No toca el DOM ni refs — es la
 * única fuente de verdad sobre "qué clip corresponde ahora", consumida tanto
 * por el hook de reproducción como (potencialmente) por tests sin navegador.
 */
export function computePlaybackSnapshot(timeline: Timeline, playheadMs: number): PlaybackSnapshot {
  const durationMs = getTimelineDurationMs(timeline)
  const active = findActiveClip(timeline, playheadMs)

  if (!active) {
    const mode: PlaybackMode = playheadMs >= durationMs ? 'ended' : 'gap'
    const upcoming = mode === 'gap' ? findClipAfter(timeline, playheadMs) : null
    return {
      mode,
      durationMs,
      activeClip: null,
      waitingClip: upcoming
        ? { id: upcoming.id, assetId: upcoming.assetId, sourceStartMs: upcoming.sourceStartMs, offsetMs: upcoming.offsetMs }
        : null,
    }
  }

  const next = findNextClip(timeline, active.clip.id)

  return {
    mode: 'clip',
    durationMs,
    activeClip: {
      id: active.clip.id,
      assetId: active.clip.assetId,
      sourceTimeMs: active.sourceTimeMs,
      sourceStartMs: active.clip.sourceStartMs,
      offsetMs: active.clip.offsetMs,
      durationMs: active.clip.durationMs,
    },
    waitingClip: next
      ? { id: next.id, assetId: next.assetId, sourceStartMs: next.sourceStartMs, offsetMs: next.offsetMs }
      : null,
  }
}
