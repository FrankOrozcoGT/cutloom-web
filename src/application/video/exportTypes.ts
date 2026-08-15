import type { VideoAsset, VideoFormat } from '@domain/video'

export interface ExportOptions {
  format: VideoFormat
  fps: number
  width: number
  height: number
}

export interface ClipRenderSegment {
  kind: 'clip'
  clipId: string
  assetId: string
  asset: VideoAsset
  sourceStartMs: number
  sourceEndMs: number
  outputStartMs: number
  outputDurationMs: number
}

/** Tramo del timeline sin ningún clip activo: se rellena con un fondo negro en la salida. */
export interface GapRenderSegment {
  kind: 'gap'
  outputStartMs: number
  outputDurationMs: number
}

export type RenderSegment = ClipRenderSegment | GapRenderSegment

export interface Subtitle {
  text: string
  startMs: number
  endMs: number
}

export type ExportPhase = 'loading' | 'decoding' | 'encoding' | 'muxing' | 'done'

export interface ExportProgressEvent {
  phase: ExportPhase
  completedSegments: number
  totalSegments: number
}

export type ExportProgressListener = (event: ExportProgressEvent) => void

export type ExportError =
  | 'EMPTY_TIMELINE'
  | 'MISSING_ASSET'
  | 'UNSUPPORTED_API'
  | 'UNSUPPORTED_CODEC'
  | 'MUX_FAILED'
  | 'ENCODING_ERROR'
  | 'INSUFFICIENT_MEMORY'
  | 'STORAGE_ERROR'
  | 'ABORTED'
