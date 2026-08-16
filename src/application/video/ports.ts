import type { VideoAsset } from '@domain/video'
import type { Result } from '@application/result'
import type { ClipRenderSegment, ExportOptions, GapRenderSegment } from './exportTypes'

export interface ComposeOptions {
  dimensions: { width: number; height: number }
  /** Texto del subtítulo activo en el timestamp de este frame, si hay alguno. */
  subtitleText?: string
}

export type VideoPickerError = 'PICKER_FAILED'
export type StorageError = 'STORAGE_FULL' | 'UNKNOWN_ERROR'
export type ThumbnailError = 'THUMBNAIL_FAILED'
export type DurationError = 'DURATION_READ_FAILED'

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

export interface ThumbnailGenerator {
  generate(file: File): Promise<Result<Blob, ThumbnailError>>
}

export interface DurationReader {
  read(file: File): Promise<Result<number, DurationError>>
}

export type EncodeError = 'UNSUPPORTED_CODEC' | 'ENCODING_ERROR' | 'MUX_FAILED' | 'INSUFFICIENT_MEMORY' | 'ABORTED'

/**
 * Callback invocado por cada frame de video decodificado dentro de la ventana del segmento.
 * `timestampSeconds` ya viene remapeado a la posición del timeline compuesto.
 */
export type VideoFrameHandler = (
  frame: VideoFrame,
  timestampSeconds: number,
  durationSeconds: number,
) => Promise<void>

/**
 * Callback invocado por cada muestra de audio decodificada dentro de la ventana del segmento.
 * `timestampSeconds` ya viene remapeado a la posición del timeline compuesto.
 */
export type AudioSampleHandler = (data: AudioData, timestampSeconds: number) => Promise<void>

export interface VideoDecoderPort {
  hasAudioTrack(segment: ClipRenderSegment): Promise<boolean>
  decodeSegment(
    segment: ClipRenderSegment,
    onVideoFrame: VideoFrameHandler,
    onAudioSample: AudioSampleHandler,
  ): Promise<void>
}

export interface CanvasPort {
  compose(frame: VideoFrame, segment: ClipRenderSegment, options: ComposeOptions): void
  /** Rellena el canvas con fondo negro para tramos del timeline sin clip activo. */
  composeBlank(segment: GapRenderSegment, options: ComposeOptions): void
  getCanvas(): OffscreenCanvas
}

export interface MediaMuxerPort {
  start(options: ExportOptions, hasAudio: boolean): Promise<Result<void, EncodeError>>
  writeVideoFrame(timestampSeconds: number, durationSeconds: number): Promise<Result<void, EncodeError>>
  writeAudioSample(data: AudioData, timestampSeconds: number): Promise<Result<void, EncodeError>>
  finalize(): Promise<Result<Blob, EncodeError>>
  abort(): Promise<void>
}
