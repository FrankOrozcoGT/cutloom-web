const DB_NAME = 'cutloom'
const DB_VERSION = 8

export const PROJECTS_STORE = 'projects'
export const VIDEOS_STORE = 'videos'
export const VIDEOS_BY_PROJECT_INDEX = 'projectId'
export const TIMELINE_STORE = 'timelines'
export const SUBTITLES_STORE = 'subtitles'
export const SHORTS_STORE = 'shorts'
export const PUBLISHING_STORE = 'publishing'

let dbPromise: Promise<IDBDatabase> | null = null

export function openCutloomDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = (event) => {
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

        // TIMELINE_STORE pasaba de v6 a v7 de keyPath 'id' (buscado por
        // índice projectId) a keyPath 'projectId' directo — igual que
        // subtitles/shorts/projects. Eso es lo que permite reusar
        // runReadModifyWrite (get+put atómico por key) sin un caso especial
        // para timelines. Un proyecto tiene a lo sumo un timeline, así que
        // projectId es una key única válida. IndexedDB no deja cambiar el
        // keyPath de un store existente, así que la migración recrea el
        // store: lee todo lo que había con el store viejo (mismo nombre,
        // referencia tomada ANTES de borrarlo), lo borra, lo crea de nuevo
        // con el keyPath correcto, y reinserta los datos ya leídos.
        if (event.oldVersion < 7 && db.objectStoreNames.contains(TIMELINE_STORE)) {
          const oldStore = transaction.objectStore(TIMELINE_STORE)
          const getAllRequest = oldStore.getAll()
          getAllRequest.onsuccess = () => {
            const records = getAllRequest.result as { projectId: string }[]
            db.deleteObjectStore(TIMELINE_STORE)
            const migratedStore = db.createObjectStore(TIMELINE_STORE, { keyPath: 'projectId' })
            for (const record of records) {
              migratedStore.put(record)
            }
          }
        } else if (!db.objectStoreNames.contains(TIMELINE_STORE)) {
          db.createObjectStore(TIMELINE_STORE, { keyPath: 'projectId' })
        }

        if (!db.objectStoreNames.contains(SUBTITLES_STORE)) {
          db.createObjectStore(SUBTITLES_STORE, { keyPath: 'id' })
        }

        if (!db.objectStoreNames.contains(SHORTS_STORE)) {
          db.createObjectStore(SHORTS_STORE, { keyPath: 'id' })
        }

        if (!db.objectStoreNames.contains(PUBLISHING_STORE)) {
          db.createObjectStore(PUBLISHING_STORE, { keyPath: 'projectId' })
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
