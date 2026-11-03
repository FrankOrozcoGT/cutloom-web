import type { Render } from '@domain/render'
import type { SubtitleSegment } from '@domain/subtitles'
import type { Result } from '@application/result'

export type RenderStorageError = 'STORAGE_ERROR' | 'CORRUPTED_DATA'

export interface RenderStorage {
  save(render: Render): Promise<Result<void, RenderStorageError>>
  getByProject(projectId: string): Promise<Result<Render | null, RenderStorageError>>
  deleteByProject(projectId: string): Promise<Result<void, RenderStorageError>>
}

export interface ClipRenderSegment {
  kind: 'clip'
  clipId: string
  assetId: string
  asset: { blob: Blob }
  sourceStartMs: number
  sourceEndMs: number
  outputStartMs: number
  outputDurationMs: number
}

export interface GapRenderSegment {
  kind: 'gap'
  outputStartMs: number
  outputDurationMs: number
}

export type RenderSegment = ClipRenderSegment | GapRenderSegment

export interface RenderOptions {
  fps: number
  width: number
  height: number
}

export type RenderPhase = 'decoding' | 'encoding' | 'muxing' | 'done'

export interface RenderProgressEvent {
  phase: RenderPhase
  completedSegments: number
  totalSegments: number
}

export type RenderProgressListener = (event: RenderProgressEvent) => void

export type RenderEngineError =
  | 'EMPTY_TIMELINE'
  | 'MISSING_ASSET'
  | 'UNSUPPORTED_API'
  | 'UNSUPPORTED_CODEC'
  | 'MUX_FAILED'
  | 'ENCODING_ERROR'
  | 'INSUFFICIENT_MEMORY'
  | 'ABORTED'

/**
 * Renderiza, SIEMPRE a partir de los VideoAsset originales (nunca de los
 * proxies), los segmentos de una secuencia a un único blob de video plano,
 * quemando los subtítulos pasados (si hay) — el render se dispara siempre
 * junto con la generación de subtítulos, así que siempre los incluye.
 */
export interface RenderEnginePort {
  render(
    segments: RenderSegment[],
    options: RenderOptions,
    subtitleSegments: SubtitleSegment[],
    onProgress?: RenderProgressListener,
  ): Promise<Result<Blob, RenderEngineError>>
}

export type ComposeError = 'CONTEXT_UNAVAILABLE'

export interface ComposeOptions {
  dimensions: { width: number; height: number }
  subtitleText?: string
  cropOffsetX?: number
}

export interface CanvasPort {
  compose(frame: VideoFrame, options: ComposeOptions): void
  composeBlank(options: ComposeOptions): void
  getCanvas(): OffscreenCanvas
}

export type EncodeError = 'UNSUPPORTED_CODEC' | 'ENCODING_ERROR' | 'MUX_FAILED' | 'INSUFFICIENT_MEMORY' | 'ABORTED'

export interface MediaMuxerPort {
  start(options: RenderOptions, hasAudio: boolean): Promise<Result<void, EncodeError>>
  writeVideoFrame(timestampSeconds: number, durationSeconds: number): Promise<Result<void, EncodeError>>
  writeAudioSample(data: AudioData, timestampSeconds: number): Promise<Result<void, EncodeError>>
  finalize(): Promise<Result<Blob, EncodeError>>
  abort(): Promise<void>
}

export type VideoFrameHandler = (frame: VideoFrame, timestampSeconds: number, durationSeconds: number) => Promise<void>
export type AudioSampleHandler = (data: AudioData, timestampSeconds: number) => Promise<void>

export interface VideoDecoderPort {
  hasAudioTrack(segment: ClipRenderSegment): Promise<boolean>
  decodeSegment(
    segment: ClipRenderSegment,
    onVideoFrame: VideoFrameHandler,
    onAudioSample: AudioSampleHandler,
  ): Promise<void>
}
