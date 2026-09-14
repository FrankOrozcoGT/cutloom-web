export interface YouTubeMetadata {
  title: string
  description: string
  tags: string[]
  categoryId: string
  thumbnailIdeas: string[]
}

export interface MetadataRevision {
  revisionId: string
  version: number
  metadata: YouTubeMetadata
}

/** subtitles va en SEGUNDOS (wire format del backend), a diferencia de SubtitleSegment del dominio que está en ms. */
export interface MetadataContext {
  summary?: string
  detectedReason?: string
  score?: number
  subtitles?: { start: number; end: number; text: string }[]
}

export interface GenerateMetadataParams {
  sourceId: string
  /** Campos genéricos, iguales para toda la serie — si vienen vacíos, el backend deja explícito que la IA debe inferirlos del context. */
  topic?: string
  tone?: string
  additionalInstructions?: string
  feedback?: string
  context?: MetadataContext
}

export type VideoType = 'long' | 'short'

export interface PublishLongItem {
  sourceId: string
  metadataRevisionId: string
  videoType: 'long'
}

export interface PublishShortItem {
  sourceId: string
  metadataRevisionId: string
  videoType: 'short'
  score: number
}

export type PublishItem = PublishLongItem | PublishShortItem

/** 'unknown' cubre un status que el backend agregó después de esta versión del frontend — nunca debe tratarse igual que 'failed' (no es un fallo, es un status que este cliente todavía no sabe interpretar). */
export type PublishItemStatus = 'uploading' | 'uploaded' | 'scheduled' | 'failed' | 'unknown'

export const PublishItemErrorKind = {
  QuotaExceeded: 'QuotaExceeded',
  TokenExpired: 'TokenExpired',
  Freeform: 'Freeform',
} as const

/**
 * error crudo de PublishItemResultDto es un string donde el backend mezcla
 * dos códigos cerrados documentados (QuotaExceeded, TokenExpired) con
 * cualquier otro mensaje libre — toPublishItemError es el único punto de
 * entrada que clasifica ese string una vez, en la frontera (mapPublishItemResult),
 * para que ningún consumidor downstream vuelva a comparar contra el string crudo.
 */
export type PublishItemError =
  | { kind: typeof PublishItemErrorKind.QuotaExceeded }
  | { kind: typeof PublishItemErrorKind.TokenExpired }
  | { kind: typeof PublishItemErrorKind.Freeform; message: string }

export function toPublishItemError(raw: string): PublishItemError {
  if (raw === 'QuotaExceeded') return { kind: PublishItemErrorKind.QuotaExceeded }
  if (raw === 'TokenExpired') return { kind: PublishItemErrorKind.TokenExpired }
  return { kind: PublishItemErrorKind.Freeform, message: raw }
}

export interface PublishItemResult {
  sourceId: string
  status: PublishItemStatus
  youtubeVideoId: string | null
  url: string | null
  error: PublishItemError | null
}

export interface BulkUploadVideo {
  sourceId: string
  blob: Blob
  fileName: string
}

export interface BulkUploadParams {
  seriesId: string
  timeZone: string
  /** Fecha ISO propuesta para el video largo — opcional; si se omite, el backend calendariza automáticamente. */
  longVideoPublishDay?: string
  items: PublishItem[]
  videos: BulkUploadVideo[]
}

export interface BulkUploadResult {
  results: PublishItemResult[]
}

/**
 * Registro persistido de un source (video largo o short) dentro de la serie
 * de un proyecto — sobrevive a recargar PublishingPage, para poder mostrar
 * "ya publicado" en vez de perder la metadata generada y el resultado de
 * publicación cada vez que se sale de la pantalla.
 */
export interface PublishedSourceRecord {
  sourceId: string
  revision: MetadataRevision
  result: PublishItemResult | null
  updatedAt: string
}

/** Un proyecto = una serie (video largo + sus shorts) — bySourceId cubre ambos, keyed por sourceId (projectId para el largo, projectId::short::<key> para cada short). Vive en su propio storage, no en ProjectShorts, porque el video largo no es un short. */
export interface ProjectPublishing {
  projectId: string
  bySourceId: Record<string, PublishedSourceRecord>
}

export function buildPublishedSourceRecord(sourceId: string, revision: MetadataRevision, result: PublishItemResult | null): PublishedSourceRecord {
  return { sourceId, revision, result, updatedAt: new Date().toISOString() }
}
