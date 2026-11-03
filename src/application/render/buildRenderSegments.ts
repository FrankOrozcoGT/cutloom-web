import { findActiveClip, getTimelineDurationMs, type Timeline } from '@domain/timeline'
import type { VideoAsset } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { RenderSegment } from './ports'

export type BuildRenderSegmentsError = 'EMPTY_TIMELINE' | 'MISSING_ASSET'

/**
 * Deriva la secuencia de tramos (clip recortado o hueco) que compone la
 * salida final del timeline, en orden, siempre apuntando al VideoAsset
 * original — nunca al proxy, que solo existe para la edición en vivo.
 */
export function buildRenderSegments(
  timeline: Timeline,
  assetsById: Record<string, VideoAsset>,
  range?: { startMs: number; endMs: number },
): Result<RenderSegment[], BuildRenderSegmentsError> {
  const timelineDurationMs = getTimelineDurationMs(timeline)
  if (timelineDurationMs <= 0) {
    return err('EMPTY_TIMELINE')
  }

  const rangeStartMs = range ? Math.max(0, range.startMs) : 0
  const durationMs = range ? Math.min(range.endMs, timelineDurationMs) : timelineDurationMs
  if (durationMs <= rangeStartMs) {
    return err('EMPTY_TIMELINE')
  }

  const boundaries = new Set<number>([rangeStartMs, durationMs])
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      boundaries.add(clip.offsetMs)
      boundaries.add(clip.offsetMs + clip.durationMs)
    }
  }
  const sortedBoundaries = [...boundaries]
    .filter((ms) => ms >= rangeStartMs && ms < durationMs)
    .sort((a, b) => a - b)

  const segments: RenderSegment[] = []

  for (const boundaryMs of sortedBoundaries) {
    const nextBoundaryMs = sortedBoundaries.find((ms) => ms > boundaryMs) ?? durationMs
    const active = findActiveClip(timeline, boundaryMs)
    const outputStartMs = boundaryMs - rangeStartMs

    if (!active) {
      segments.push({
        kind: 'gap',
        outputStartMs,
        outputDurationMs: nextBoundaryMs - boundaryMs,
      })
      continue
    }

    const asset = assetsById[active.clip.assetId]
    if (!asset) {
      return err('MISSING_ASSET')
    }

    const clipEndMs: number = active.clip.offsetMs + active.clip.durationMs
    const segmentEndMs = Math.min(clipEndMs, nextBoundaryMs, durationMs)
    const outputDurationMs = segmentEndMs - boundaryMs

    segments.push({
      kind: 'clip',
      clipId: active.clip.id,
      assetId: active.clip.assetId,
      asset: { blob: asset.blob },
      sourceStartMs: active.sourceTimeMs,
      sourceEndMs: active.sourceTimeMs + outputDurationMs,
      outputStartMs,
      outputDurationMs,
    })
  }

  if (segments.length === 0) {
    return err('EMPTY_TIMELINE')
  }

  return ok(segments)
}
