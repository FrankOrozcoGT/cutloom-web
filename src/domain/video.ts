export type VideoFormat = 'video/mp4' | 'video/webm'

export interface VideoAsset {
  id: string
  projectId: string
  name: string
  blob: Blob
  size: number
  type: VideoFormat
  createdAt: string
}

export interface VideoUploadResult {
  asset: VideoAsset
  thumbnail: Blob
}

export type UploadError =
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'STORAGE_FULL'
  | 'THUMBNAIL_FAILED'
  | 'UNKNOWN_ERROR'

export type ValidationError = 'UNSUPPORTED_FORMAT' | 'FILE_TOO_LARGE'
