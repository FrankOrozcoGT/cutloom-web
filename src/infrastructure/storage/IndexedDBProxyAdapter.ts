import type { ProxyAsset } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { ProxyStorage, StorageError } from '@application/video/ports'
import { openCutloomDB, runTransaction, PROXIES_BY_PROJECT_INDEX, PROXIES_BY_VIDEO_ASSET_INDEX, PROXIES_STORE } from './database'

export class IndexedDBProxyAdapter implements ProxyStorage {
  async save(proxy: ProxyAsset): Promise<Result<void, StorageError>> {
    try {
      const db = await openCutloomDB()
      await runTransaction(db, PROXIES_STORE, 'readwrite', (store) => store.put(proxy))
      return ok(undefined)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        return err('STORAGE_FULL')
      }
      return err('UNKNOWN_ERROR')
    }
  }

  async getByVideoAsset(videoAssetId: string): Promise<ProxyAsset | null> {
    const db = await openCutloomDB()
    const results = await runTransaction(db, PROXIES_STORE, 'readonly', (store) =>
      store.index(PROXIES_BY_VIDEO_ASSET_INDEX).getAll(videoAssetId),
    )
    return (results as ProxyAsset[])[0] ?? null
  }

  async getByProject(projectId: string): Promise<ProxyAsset[]> {
    const db = await openCutloomDB()
    return runTransaction(db, PROXIES_STORE, 'readonly', (store) =>
      store.index(PROXIES_BY_PROJECT_INDEX).getAll(projectId),
    )
  }

  async deleteByProject(projectId: string): Promise<Result<void, StorageError>> {
    try {
      const db = await openCutloomDB()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(PROXIES_STORE, 'readwrite')
        const store = transaction.objectStore(PROXIES_STORE)
        const cursorRequest = store.index(PROXIES_BY_PROJECT_INDEX).openKeyCursor(IDBKeyRange.only(projectId))
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (!cursor) return
          store.delete(cursor.primaryKey)
          cursor.continue()
        }
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
        transaction.oncomplete = () => resolve()
      })
      return ok(undefined)
    } catch {
      return err('UNKNOWN_ERROR')
    }
  }
}
