const DB_NAME = 'cutloom'
const DB_VERSION = 6

export const PROJECTS_STORE = 'projects'
export const VIDEOS_STORE = 'videos'
export const VIDEOS_BY_PROJECT_INDEX = 'projectId'
export const TIMELINE_STORE = 'timelines'
export const TIMELINE_BY_PROJECT_INDEX = 'projectId'
export const SUBTITLES_STORE = 'subtitles'
export const SHORTS_STORE = 'shorts'

let dbPromise: Promise<IDBDatabase> | null = null

export function openCutloomDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        const transaction = request.transaction!

        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
        }

        const videos = db.objectStoreNames.contains(VIDEOS_STORE)
          ? transaction.objectStore(VIDEOS_STORE)
          : db.createObjectStore(VIDEOS_STORE, { keyPath: 'id' })

        if (!videos.indexNames.contains(VIDEOS_BY_PROJECT_INDEX)) {
          videos.createIndex(VIDEOS_BY_PROJECT_INDEX, 'projectId')
        }

        const timelines = db.objectStoreNames.contains(TIMELINE_STORE)
          ? transaction.objectStore(TIMELINE_STORE)
          : db.createObjectStore(TIMELINE_STORE, { keyPath: 'id' })

        if (!timelines.indexNames.contains(TIMELINE_BY_PROJECT_INDEX)) {
          timelines.createIndex(TIMELINE_BY_PROJECT_INDEX, 'projectId')
        }

        if (!db.objectStoreNames.contains(SUBTITLES_STORE)) {
          db.createObjectStore(SUBTITLES_STORE, { keyPath: 'id' })
        }

        if (!db.objectStoreNames.contains(SHORTS_STORE)) {
          db.createObjectStore(SHORTS_STORE, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return dbPromise
}

export function runTransaction<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
  retried = false,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = action(store)

    const retryOrReject = () => {
      if (!retried) {
        runTransaction(db, storeName, mode, action, true).then(resolve, reject)
        return
      }
      reject(transaction.error)
    }

    transaction.onerror = retryOrReject
    transaction.onabort = retryOrReject
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * Read-modify-write atómico: get y put ocurren dentro de la MISMA
 * transacción readwrite, encadenados en el callback onsuccess del get (sin
 * ningún `await` de por medio) — mientras eso se cumpla, IndexedDB garantiza
 * que ninguna otra transacción sobre el mismo store puede intercalarse entre
 * la lectura y la escritura. Dos llamadas concurrentes a esta función ya no
 * pueden pisarse (lost update): la segunda transacción espera a que la
 * primera termine antes de empezar su propio get.
 */
export function runReadModifyWrite<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
  modify: (existing: T | undefined) => T,
  retried = false,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const getRequest = store.get(key)

    let updated: T
    let modifyFailed = false
    const retryOrReject = () => {
      // Un error propio de `modify` (ej. registro inexistente) no es un
      // fallo transaccional de IndexedDB — no tiene sentido reintentar la
      // transacción completa por eso, el resultado sería el mismo.
      if (modifyFailed) return
      if (!retried) {
        runReadModifyWrite(db, storeName, key, modify, true).then(resolve, reject)
        return
      }
      reject(transaction.error)
    }

    transaction.onerror = retryOrReject
    transaction.onabort = retryOrReject

    getRequest.onsuccess = () => {
      try {
        updated = modify(getRequest.result as T | undefined)
      } catch (e) {
        modifyFailed = true
        reject(e)
        transaction.abort()
        return
      }
      store.put(updated)
    }
    transaction.oncomplete = () => resolve(updated)
  })
}
