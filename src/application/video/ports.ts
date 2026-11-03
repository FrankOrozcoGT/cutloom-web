import type { ProxyAsset, VideoAsset } from '@domain/video'
import type { Result } from '@application/result'

export type VideoPickerError = 'PICKER_FAILED'
export type StorageError = 'STORAGE_FULL' | 'UNKNOWN_ERROR'
export type ThumbnailError = 'THUMBNAIL_FAILED'
export type DurationError = 'DURATION_READ_FAILED'
export type ProxyError = 'UNSUPPORTED_API' | 'UNSUPPORTED_CODEC' | 'ENCODING_ERROR' | 'MUX_FAILED'

export interface FilePicker {
  pickVideoFiles(): Promise<Result<File[], VideoPickerError>>
}

export interface VideoStorage {
  save(file: File, projectId: string, durationMs: number): Promise<Result<VideoAsset, StorageError>>
  getAll(): Promise<VideoAsset[]>
  getByProject(projectId: string): Promise<VideoAsset[]>
  delete(id: string): Promise<Result<void, StorageError>>
  deleteByProject(projectId: string): Promise<Result<void, StorageError>>
}

export interface ProxyStorage {
  save(proxy: ProxyAsset): Promise<Result<void, StorageError>>
  getByVideoAsset(videoAssetId: string): Promise<ProxyAsset | null>
  getByProject(projectId: string): Promise<ProxyAsset[]>
  deleteByProject(projectId: string): Promise<Result<void, StorageError>>
}

export interface ThumbnailGenerator {
  generate(file: File): Promise<Result<Blob, ThumbnailError>>
}

export interface DurationReader {
  read(file: File): Promise<Result<number, DurationError>>
}

/** Progreso de la generación del proxy, 0 a 1. */
export type ProxyProgressListener = (progress: number) => void

/**
 * Genera, a partir del original, una copia liviana con índice de seek
 * propio (mitad de resolución, mismo framerate, H.264/MP4 vía
 * VideoEncoder+mp4-muxer) — es la única pieza sobre la que trabaja la
 * edición en vivo (timeline, scrubbing, recorte de silencios). El original
 * nunca se decodifica mientras se edita, solo al generar el render final.
 */
export interface ProxyGeneratorPort {
  generate(asset: VideoAsset, onProgress?: ProxyProgressListener): Promise<Result<ProxyAsset, ProxyError>>
}
