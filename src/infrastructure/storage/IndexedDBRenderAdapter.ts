import type { Render } from '@domain/render'
import { err, ok, type Result } from '@application/result'
import type { RenderStorage, RenderStorageError } from '@application/render/ports'
import { openCutloomDB, runTransaction, RENDERS_STORE } from './database'

function isValidRender(value: unknown): value is Render {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.projectId === 'string' &&
    candidate.blob instanceof Blob &&
    typeof candidate.timelineFingerprint === 'string'
  )
}

export class IndexedDBRenderAdapter implements RenderStorage {
  async save(render: Render): Promise<Result<void, RenderStorageError>> {
    try {
      const db = await openCutloomDB()
      await runTransaction(db, RENDERS_STORE, 'readwrite', (store) => store.put(render))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }

  async getByProject(projectId: string): Promise<Result<Render | null, RenderStorageError>> {
    try {
      const db = await openCutloomDB()
      const result = await runTransaction(db, RENDERS_STORE, 'readonly', (store) => store.get(projectId))
      if (result === undefined) {
        return ok(null)
      }
      if (!isValidRender(result)) {
        return err('CORRUPTED_DATA')
      }
      return ok(result)
    } catch {
      return err('STORAGE_ERROR')
    }
  }

  async deleteByProject(projectId: string): Promise<Result<void, RenderStorageError>> {
    try {
      const db = await openCutloomDB()
      await runTransaction(db, RENDERS_STORE, 'readwrite', (store) => store.delete(projectId))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }
}
