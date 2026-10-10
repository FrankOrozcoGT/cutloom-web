import type { PublishedMetadataRecord, PublishedResultRecord, ProjectPublishing } from '@domain/publishing'
import { err, ok, type Result } from '@application/result'
import type { PublishingStorageError, PublishingStoragePort } from '@application/publishing/ports'
import { openCutloomDB, runReadModifyWrite, runTransaction, PUBLISHING_STORE } from '@infrastructure/storage/database'

function isValidProjectPublishing(value: unknown): value is ProjectPublishing {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.metadataBySourceId === 'object' &&
    candidate.metadataBySourceId !== null &&
    typeof candidate.resultsByKey === 'object' &&
    candidate.resultsByKey !== null
  )
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

  /** Read-modify-write atómico (misma transacción IndexedDB) — crea el registro del proyecto si no existía, o actualiza solo la metadata de ese sourceId sin pisar el resto de la serie. */
  async upsertMetadata(projectId: string, sourceId: string, record: PublishedMetadataRecord): Promise<Result<void, PublishingStorageError>> {
    try {
      const db = await openCutloomDB()
      await runReadModifyWrite<ProjectPublishing>(db, PUBLISHING_STORE, projectId, (existing) => ({
        ...existing,
        projectId,
        metadataBySourceId: { ...existing?.metadataBySourceId, [sourceId]: record },
        resultsByKey: existing?.resultsByKey ?? {},
      }))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }

  /** Read-modify-write atómico — crea el registro del proyecto si no existía, o actualiza solo el resultado de esa key (`${platform}::${sourceId}`) sin pisar el resto de la serie. */
  async upsertResult(projectId: string, key: string, record: PublishedResultRecord): Promise<Result<void, PublishingStorageError>> {
    try {
      const db = await openCutloomDB()
      await runReadModifyWrite<ProjectPublishing>(db, PUBLISHING_STORE, projectId, (existing) => ({
        ...existing,
        projectId,
        metadataBySourceId: existing?.metadataBySourceId ?? {},
        resultsByKey: { ...existing?.resultsByKey, [key]: record },
      }))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }

  /** Read-modify-write atómico — crea el registro del proyecto si no existía, o actualiza solo el default de la URL manual sin pisar el resto de la serie. url undefined/vacío borra el campo. */
  async upsertManualLongVideoUrl(projectId: string, url: string | undefined): Promise<Result<void, PublishingStorageError>> {
    try {
      const db = await openCutloomDB()
      await runReadModifyWrite<ProjectPublishing>(db, PUBLISHING_STORE, projectId, (existing) => ({
        ...existing,
        projectId,
        metadataBySourceId: existing?.metadataBySourceId ?? {},
        resultsByKey: existing?.resultsByKey ?? {},
        manualLongVideoUrl: url,
      }))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }

  async deleteByProject(projectId: string): Promise<Result<void, PublishingStorageError>> {
    try {
      const db = await openCutloomDB()
      await runTransaction(db, PUBLISHING_STORE, 'readwrite', (store) => store.delete(projectId))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }
}
