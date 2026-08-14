import type { Timeline } from '@domain/timeline'
import { err, ok, type Result } from '@application/result'
import type { TimelineStorage, TimelineStorageError } from '@application/timeline/ports'
import { openCutloomDB, runTransaction, TIMELINE_BY_PROJECT_INDEX, TIMELINE_STORE } from './database'

function isValidClip(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const clip = value as Record<string, unknown>
  return (
    typeof clip.id === 'string' &&
    typeof clip.assetId === 'string' &&
    Number.isFinite(clip.durationMs) &&
    Number.isFinite(clip.offsetMs) &&
    Number.isFinite(clip.sourceStartMs)
  )
}

function isValidTrack(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const track = value as Record<string, unknown>
  return typeof track.id === 'string' && Array.isArray(track.clips) && track.clips.every(isValidClip)
}

function isValidTimeline(value: unknown): value is Timeline {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.projectId === 'string' &&
    Array.isArray(candidate.tracks) &&
    candidate.tracks.every(isValidTrack)
  )
}

export class IndexedDBTimelineAdapter implements TimelineStorage {
  async getByProject(projectId: string): Promise<Result<Timeline | null, TimelineStorageError>> {
    const db = await openCutloomDB()
    const results = await runTransaction(db, TIMELINE_STORE, 'readonly', (store) =>
      store.index(TIMELINE_BY_PROJECT_INDEX).getAll(projectId),
    )
    const timeline = results[0]
    if (timeline === undefined) {
      return ok(null)
    }
    if (!isValidTimeline(timeline)) {
      return err('CORRUPTED_DATA')
    }
    return ok(timeline)
  }

  async save(timeline: Timeline): Promise<Result<void, TimelineStorageError>> {
    try {
      const db = await openCutloomDB()
      await runTransaction(db, TIMELINE_STORE, 'readwrite', (store) => store.put(timeline))
      return ok(undefined)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        return err('STORAGE_FULL')
      }
      return err('UNKNOWN_ERROR')
    }
  }

  async delete(projectId: string): Promise<Result<void, TimelineStorageError>> {
    try {
      const db = await openCutloomDB()
      const existingResult = await this.getByProject(projectId)
      if (existingResult.ok && existingResult.value) {
        await runTransaction(db, TIMELINE_STORE, 'readwrite', (store) => store.delete(existingResult.value!.id))
      }
      return ok(undefined)
    } catch {
      return err('UNKNOWN_ERROR')
    }
  }
}
