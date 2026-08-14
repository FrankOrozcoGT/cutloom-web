import type { VideoAsset, VideoFormat } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { StorageError, VideoStorage } from '@application/video/ports'
import { openCutloomDB, runTransaction, VIDEOS_BY_PROJECT_INDEX, VIDEOS_STORE } from './database'

export class IndexedDBAdapter implements VideoStorage {
  async save(file: File, projectId: string): Promise<Result<VideoAsset, StorageError>> {
    const asset: VideoAsset = {
      id: crypto.randomUUID(),
      projectId,
      name: file.name,
      blob: file,
      size: file.size,
      type: file.type as VideoFormat,
      createdAt: new Date().toISOString(),
    }

    try {
      const db = await openCutloomDB()
      await runTransaction(db, VIDEOS_STORE, 'readwrite', (store) => store.put(asset))
      return ok(asset)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        return err('STORAGE_FULL')
      }
      return err('UNKNOWN_ERROR')
    }
  }

  async getAll(): Promise<VideoAsset[]> {
    const db = await openCutloomDB()
    return runTransaction(db, VIDEOS_STORE, 'readonly', (store) => store.getAll())
  }

  async getByProject(projectId: string): Promise<VideoAsset[]> {
    const db = await openCutloomDB()
    return runTransaction(db, VIDEOS_STORE, 'readonly', (store) =>
      store.index(VIDEOS_BY_PROJECT_INDEX).getAll(projectId),
    )
  }

  async delete(id: string): Promise<Result<void, StorageError>> {
    try {
      const db = await openCutloomDB()
      await runTransaction(db, VIDEOS_STORE, 'readwrite', (store) => store.delete(id))
      return ok(undefined)
    } catch {
      return err('UNKNOWN_ERROR')
    }
  }

  async deleteByProject(projectId: string): Promise<Result<void, StorageError>> {
    try {
      const videos = await this.getByProject(projectId)
      const db = await openCutloomDB()
      await Promise.all(
        videos.map((video) => runTransaction(db, VIDEOS_STORE, 'readwrite', (store) => store.delete(video.id))),
      )
      return ok(undefined)
    } catch {
      return err('UNKNOWN_ERROR')
    }
  }
}
