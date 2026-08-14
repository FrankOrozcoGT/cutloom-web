import type { VideoAsset } from '@domain/video'
import type { Result } from '@application/result'

export type VideoPickerError = 'PICKER_FAILED'
export type StorageError = 'STORAGE_FULL' | 'UNKNOWN_ERROR'
export type ThumbnailError = 'THUMBNAIL_FAILED'

export interface FilePicker {
  pickVideoFiles(): Promise<Result<File[], VideoPickerError>>
}

export interface VideoStorage {
  save(file: File, projectId: string): Promise<Result<VideoAsset, StorageError>>
  getAll(): Promise<VideoAsset[]>
  getByProject(projectId: string): Promise<VideoAsset[]>
  delete(id: string): Promise<Result<void, StorageError>>
  deleteByProject(projectId: string): Promise<Result<void, StorageError>>
}

export interface ThumbnailGenerator {
  generate(file: File): Promise<Result<Blob, ThumbnailError>>
}
