import type { Subtitles } from '@domain/subtitles'
import { err, ok, type Result } from '@application/result'
import type { SubtitlesStorageError, SubtitlesStoragePort } from '@application/subtitles/ports'
import { openCutloomDB, runTransaction, SUBTITLES_STORE } from './database'

interface StoredSubtitles extends Subtitles {
  /** Un proyecto tiene a lo sumo un Subtitles asociado: se usa projectId como keyPath. */
  id: string
}

function isValidSegment(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const segment = value as Record<string, unknown>
  return (
    typeof segment.id === 'string' &&
    typeof segment.text === 'string' &&
    Number.isFinite(segment.startMs) &&
    Number.isFinite(segment.endMs)
  )
}

function isValidSubtitles(value: unknown): value is StoredSubtitles {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.projectId === 'string' &&
    (candidate.language === 'es' || candidate.language === 'en') &&
    Array.isArray(candidate.segments) &&
    candidate.segments.every(isValidSegment)
  )
}

export class IndexedDBSubtitlesAdapter implements SubtitlesStoragePort {
  async save(subtitles: Subtitles): Promise<Result<void, SubtitlesStorageError>> {
    try {
      const db = await openCutloomDB()
      const record: StoredSubtitles = { ...subtitles, id: subtitles.projectId }
      await runTransaction(db, SUBTITLES_STORE, 'readwrite', (store) => store.put(record))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }

  async getByProject(projectId: string): Promise<Result<Subtitles | null, SubtitlesStorageError>> {
    try {
      const db = await openCutloomDB()
      const result = await runTransaction(db, SUBTITLES_STORE, 'readonly', (store) => store.get(projectId))
      if (result === undefined) {
        return ok(null)
      }
      if (!isValidSubtitles(result)) {
        return err('CORRUPTED_DATA')
      }
      return ok(result)
    } catch {
      return err('STORAGE_ERROR')
    }
  }

  async deleteByProject(projectId: string): Promise<Result<void, SubtitlesStorageError>> {
    try {
      const db = await openCutloomDB()
      await runTransaction(db, SUBTITLES_STORE, 'readwrite', (store) => store.delete(projectId))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }
}
