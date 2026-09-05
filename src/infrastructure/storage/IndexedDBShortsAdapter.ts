import type { ProjectShorts } from '@domain/shorts'
import { err, ok, type Result } from '@application/result'
import type { ShortsStorageError, ShortsStoragePort } from '@application/shorts/ports'
import { openCutloomDB, runTransaction, SHORTS_STORE } from './database'

interface StoredProjectShorts extends ProjectShorts {
  /** Un proyecto tiene a lo sumo un ProjectShorts asociado: se usa projectId como keyPath. */
  id: string
}

function isValidShort(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const short = value as Record<string, unknown>
  return (
    Number.isFinite(short.startMs) &&
    Number.isFinite(short.endMs) &&
    Number.isFinite(short.confidence) &&
    typeof short.reason === 'string' &&
    Number.isFinite(short.score)
  )
}

function isValidProjectShorts(value: unknown): value is StoredProjectShorts {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.projectId === 'string' &&
    Array.isArray(candidate.shorts) &&
    candidate.shorts.every(isValidShort)
  )
}

export class IndexedDBShortsAdapter implements ShortsStoragePort {
  async save(shorts: ProjectShorts): Promise<Result<void, ShortsStorageError>> {
    try {
      const db = await openCutloomDB()
      const record: StoredProjectShorts = { ...shorts, id: shorts.projectId }
      await runTransaction(db, SHORTS_STORE, 'readwrite', (store) => store.put(record))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }

  async getByProject(projectId: string): Promise<Result<ProjectShorts | null, ShortsStorageError>> {
    try {
      const db = await openCutloomDB()
      const result = await runTransaction(db, SHORTS_STORE, 'readonly', (store) => store.get(projectId))
      if (result === undefined) {
        return ok(null)
      }
      if (!isValidProjectShorts(result)) {
        return err('CORRUPTED_DATA')
      }
      return ok(result)
    } catch {
      return err('STORAGE_ERROR')
    }
  }

  async deleteByProject(projectId: string): Promise<Result<void, ShortsStorageError>> {
    try {
      const db = await openCutloomDB()
      await runTransaction(db, SHORTS_STORE, 'readwrite', (store) => store.delete(projectId))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }
}
