import { findActiveClip, findNextClip, getTimelineDurationMs, type Timeline } from '@domain/timeline'

export type PlaybackMode = 'clip' | 'gap' | 'ended'

export interface PlaybackSnapshot {
  mode: PlaybackMode
  durationMs: number
  activeClip: { id: string; assetId: string; sourceTimeMs: number; offsetMs: number; durationMs: number } | null
  waitingClip: { id: string; assetId: string; sourceStartMs: number } | null
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
    return { mode, durationMs, activeClip: null, waitingClip: null }
  }

  const next = findNextClip(timeline, active.clip.id)

  return {
    mode: 'clip',
    durationMs,
    activeClip: {
      id: active.clip.id,
      assetId: active.clip.assetId,
      sourceTimeMs: active.sourceTimeMs,
      offsetMs: active.clip.offsetMs,
      durationMs: active.clip.durationMs,
    },
    waitingClip: next ? { id: next.id, assetId: next.assetId, sourceStartMs: next.sourceStartMs } : null,
  }
}
