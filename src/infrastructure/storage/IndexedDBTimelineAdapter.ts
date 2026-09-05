import type { Timeline } from '@domain/timeline'
import { err, ok, type Result } from '@application/result'
import type { TimelineStorage, TimelineStorageError } from '@application/timeline/ports'
import { openCutloomDB, runReadModifyWrite, runTransaction, TIMELINE_STORE } from './database'

/** Puente entre el Result<Timeline, E> que devuelve `modify` (capa de aplicación) y el mecanismo de runReadModifyWrite, que señaliza "no persistir nada" lanzando una excepción — se desenvuelve de vuelta a Result en readModifyWrite, nunca se propaga fuera de este archivo. */
class ModifyRejected<E> extends Error {
  domainError: E
  constructor(domainError: E) {
    super('ModifyRejected')
    this.domainError = domainError
  }
}

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
    const timeline = await runTransaction(db, TIMELINE_STORE, 'readonly', (store) => store.get(projectId))
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
      await runTransaction(db, TIMELINE_STORE, 'readwrite', (store) => store.delete(projectId))
      return ok(undefined)
    } catch {
      return err('UNKNOWN_ERROR')
    }
  }

  async readModifyWrite<E>(
    projectId: string,
    modify: (existing: Timeline | null) => Result<Timeline, E>,
  ): Promise<Result<Timeline, TimelineStorageError | E>> {
    try {
      const db = await openCutloomDB()
      const updated = await runReadModifyWrite<Timeline>(db, TIMELINE_STORE, projectId, (existing) => {
        if (existing !== undefined && !isValidTimeline(existing)) {
          throw new ModifyRejected<TimelineStorageError | E>('CORRUPTED_DATA')
        }
        const result = modify(existing ?? null)
        if (!result.ok) {
          throw new ModifyRejected<TimelineStorageError | E>(result.error)
        }
        return result.value
      })
      return ok(updated)
    } catch (e) {
      if (e instanceof ModifyRejected) {
        return err(e.domainError)
      }
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        return err('STORAGE_FULL')
      }
      return err('UNKNOWN_ERROR')
    }
  }
}
