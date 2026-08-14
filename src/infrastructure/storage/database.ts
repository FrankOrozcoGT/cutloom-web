const DB_NAME = 'cutloom'
const DB_VERSION = 3

export const PROJECTS_STORE = 'projects'
export const VIDEOS_STORE = 'videos'
export const VIDEOS_BY_PROJECT_INDEX = 'projectId'

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
