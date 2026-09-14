import type { PublishedSourceRecord, ProjectPublishing } from '@domain/publishing'
import { err, ok, type Result } from '@application/result'
import type { PublishingStorageError, PublishingStoragePort } from '@application/publishing/ports'
import { openCutloomDB, runReadModifyWrite, runTransaction, PUBLISHING_STORE } from '@infrastructure/storage/database'

function isValidProjectPublishing(value: unknown): value is ProjectPublishing {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.projectId === 'string' && typeof candidate.bySourceId === 'object' && candidate.bySourceId !== null
}

export class IndexedDBPublishingAdapter implements PublishingStoragePort {
  async getByProject(projectId: string): Promise<Result<ProjectPublishing | null, PublishingStorageError>> {
    try {
      const db = await openCutloomDB()
      const result = await runTransaction(db, PUBLISHING_STORE, 'readonly', (store) => store.get(projectId))
      if (result === undefined) {
        return ok(null)
      }
      if (!isValidProjectPublishing(result)) {
        return err('CORRUPTED_DATA')
      }
      return ok(result)
    } catch {
      return err('STORAGE_ERROR')
    }
  }

  /** Read-modify-write atómico (misma transacción IndexedDB) — crea el registro del proyecto si no existía, o actualiza solo la entrada de ese sourceId sin pisar el resto de la serie. */
  async upsertSource(projectId: string, record: PublishedSourceRecord): Promise<Result<void, PublishingStorageError>> {
    try {
      const db = await openCutloomDB()
      await runReadModifyWrite<ProjectPublishing>(db, PUBLISHING_STORE, projectId, (existing) => ({
        projectId,
        bySourceId: { ...existing?.bySourceId, [record.sourceId]: record },
      }))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }
}
