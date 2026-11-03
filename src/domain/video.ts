export type VideoFormat = 'video/mp4' | 'video/webm'

// AAC (mp4a.40.2) no tiene soporte de encode en WebCodecs en Chromium para
// Linux de escritorio — Opus sí, y es un codec de audio válido dentro de un
// contenedor MP4. Único punto de verdad: cualquier pipeline que encodee
// audio con WebCodecs/mediabunny (proxy, render, shorts) usa este codec.
export const AUDIO_ENCODE_CODEC = 'opus'

export interface VideoAsset {
  id: string
  projectId: string
  name: string
  blob: Blob
  size: number
  type: VideoFormat
  durationMs: number
  createdAt: string
}

/** Copia liviana del original con índice de seek propio (H.264/MP4), generada una vez al subir — es la única pieza sobre la que trabaja la edición en vivo. El original nunca se decodifica mientras se edita, solo al generar el render final. */
export interface ProxyAsset {
  id: string
  videoAssetId: string
  projectId: string
  blob: Blob
  durationMs: number
  createdAt: string
}

export interface VideoUploadResult {
  asset: VideoAsset
  thumbnail: Blob
  proxy: ProxyAsset
}

export type ValidationError = 'UNSUPPORTED_FORMAT' | 'FILE_TOO_LARGE'

export type UploadError =
  | ValidationError
  | 'STORAGE_FULL'
  | 'THUMBNAIL_FAILED'
  | 'DURATION_READ_FAILED'
  | 'PROXY_GENERATION_FAILED'
  | 'UNKNOWN_ERROR'
