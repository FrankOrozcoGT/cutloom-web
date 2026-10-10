import { err, ok, type Result } from '@application/result'
import { openCutloomDB, runTransaction, PUBLISH_BLOBS_STORE } from '@infrastructure/storage/database'

interface PublishBlobRecord {
  sourceId: string
  blob: Blob
  fileName: string
}

export type PublishBlobStorageError = 'STORAGE_ERROR' | 'STORAGE_FULL'

/**
 * Guarda los blobs exportados en IndexedDB (disco) en vez de retenerlos en un
 * array en memoria JS — con un bulk de varios shorts pesados, acumular todos
 * los Blob exportados a la vez en RAM puede agotar la memoria del navegador
 * en equipos modestos. El loop de publish() guarda cada blob apenas termina
 * de exportarse y lo vuelve a leer recién al momento de subirlo, borrándolo
 * de acá inmediatamente después (éxito o fallo) — nunca hay más blobs
 * "vivos" en memoria que los que están subiéndose en paralelo ahora mismo
 * (ver MAX_CONCURRENT_UPLOADS en usePublish.ts).
 */
export class PublishBlobStorage {
  async save(sourceId: string, blob: Blob, fileName: string): Promise<Result<void, PublishBlobStorageError>> {
    try {
      const db = await openCutloomDB()
      const record: PublishBlobRecord = { sourceId, blob, fileName }
      await runTransaction(db, PUBLISH_BLOBS_STORE, 'readwrite', (store) => store.put(record))
      return ok(undefined)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        return err('STORAGE_FULL')
      }
      return err('STORAGE_ERROR')
    }
  }

  async get(sourceId: string): Promise<Result<{ blob: Blob; fileName: string } | null, PublishBlobStorageError>> {
    try {
      const db = await openCutloomDB()
      const record = await runTransaction(db, PUBLISH_BLOBS_STORE, 'readonly', (store) => store.get(sourceId))
      const typed = record as PublishBlobRecord | undefined
      return ok(typed ? { blob: typed.blob, fileName: typed.fileName } : null)
    } catch {
      return err('STORAGE_ERROR')
    }
  }

  async remove(sourceId: string): Promise<Result<void, PublishBlobStorageError>> {
    try {
      const db = await openCutloomDB()
      await runTransaction(db, PUBLISH_BLOBS_STORE, 'readwrite', (store) => store.delete(sourceId))
      return ok(undefined)
    } catch {
      return err('STORAGE_ERROR')
    }
  }
}
