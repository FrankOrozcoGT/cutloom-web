import {
  addClipToTrack,
  createClip,
  createTimeline,
  findValidTrack,
  moveClip as moveClipInDomain,
  resizeClip as resizeClipInDomain,
  type Timeline,
  type TrimEdge,
} from '@domain/timeline'
import { err, ok, type Result } from '@application/result'
import type { TimelineStorage } from './ports'

export type ArrangeError =
  | 'OVERLAP'
  | 'TRACK_FULL'
  | 'INVALID_DURATION'
  | 'INVALID_OFFSET'
  | 'CLIP_NOT_FOUND'
  | 'TRACK_NOT_FOUND'
  | 'TRIM_EXCEEDS_SOURCE'
  | 'CORRUPTED_DATA'
  | 'STORAGE_ERROR'

export class ArrangeClipsUseCase {
  private readonly storage: TimelineStorage

  constructor(storage: TimelineStorage) {
    this.storage = storage
  }

  async getTimeline(projectId: string): Promise<Result<Timeline, ArrangeError>> {
    const existingResult = await this.storage.getByProject(projectId)
    if (!existingResult.ok) {
      return err(existingResult.error === 'CORRUPTED_DATA' ? 'CORRUPTED_DATA' : 'STORAGE_ERROR')
    }
    return ok(existingResult.value ?? this.createNewTimeline(projectId))
  }

  createNewTimeline(projectId: string): Timeline {
    return createTimeline(projectId)
  }

  async addClip(
    projectId: string,
    assetId: string,
    durationMs: number,
    trackId?: string,
    offsetMs?: number,
  ): Promise<Result<Timeline, ArrangeError>> {
    const timelineResult = await this.getTimeline(projectId)
    if (!timelineResult.ok) {
      return err(timelineResult.error)
    }
    const timeline = timelineResult.value

    const resolvedOffset = offsetMs ?? this.appendOffset(timeline, trackId)
    const clipResult = createClip(assetId, durationMs, resolvedOffset)
    if (!clipResult.ok) {
      return err(clipResult.error)
    }

    const targetTrack = trackId
      ? timeline.tracks.find((track) => track.id === trackId)
      : findValidTrack(timeline, clipResult.value)

    if (!targetTrack) {
      return err(trackId ? 'TRACK_NOT_FOUND' : 'TRACK_FULL')
    }

    const addResult = addClipToTrack(timeline, clipResult.value, targetTrack.id)
    if (!addResult.ok) {
      return err(addResult.error)
    }

    const saveResult = await this.storage.save(addResult.value)
    if (!saveResult.ok) {
      return err('STORAGE_ERROR')
    }

    return ok(addResult.value)
  }

  async moveClip(
    projectId: string,
    clipId: string,
    newTrackId?: string,
    newOffsetMs?: number,
  ): Promise<Result<Timeline, ArrangeError>> {
    const timelineResult = await this.getTimeline(projectId)
    if (!timelineResult.ok) {
      return err(timelineResult.error)
    }
    const timeline = timelineResult.value

    const currentTrack = timeline.tracks.find((track) => track.clips.some((clip) => clip.id === clipId))
    if (!currentTrack) {
      return err('CLIP_NOT_FOUND')
    }
    const currentClip = currentTrack.clips.find((clip) => clip.id === clipId)!

    const resolvedTrackId = newTrackId ?? currentTrack.id
    const resolvedOffset = newOffsetMs ?? currentClip.offsetMs

    const moveResult = moveClipInDomain(timeline, clipId, resolvedTrackId, resolvedOffset)
    if (!moveResult.ok) {
      return err(moveResult.error)
    }

    const saveResult = await this.storage.save(moveResult.value)
    if (!saveResult.ok) {
      return err('STORAGE_ERROR')
    }

    return ok(moveResult.value)
  }

  async resizeClip(
    projectId: string,
    clipId: string,
    edge: TrimEdge,
    newBoundaryMs: number,
    sourceDurationMs: number,
  ): Promise<Result<Timeline, ArrangeError>> {
    const timelineResult = await this.getTimeline(projectId)
    if (!timelineResult.ok) {
      return err(timelineResult.error)
    }
    const timeline = timelineResult.value

    const resizeResult = resizeClipInDomain(timeline, clipId, edge, newBoundaryMs, sourceDurationMs)
    if (!resizeResult.ok) {
      return err(resizeResult.error)
    }

    const saveResult = await this.storage.save(resizeResult.value)
    if (!saveResult.ok) {
      return err('STORAGE_ERROR')
    }

    return ok(resizeResult.value)
  }

  private appendOffset(timeline: Timeline, trackId?: string): number {
    const track = trackId ? timeline.tracks.find((t) => t.id === trackId) : undefined
    const clips = track ? track.clips : timeline.tracks.flatMap((t) => t.clips)
    if (clips.length === 0) {
      return 0
    }
    return Math.max(...clips.map((clip) => clip.offsetMs + clip.durationMs))
  }
}
