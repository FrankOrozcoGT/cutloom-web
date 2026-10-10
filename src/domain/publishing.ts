import type { PublishingPlatform } from './platform'
import type { Notification } from './notification'

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

/** subtitles va en SEGUNDOS (wire format del backend), a diferencia de SubtitleSegment del dominio que está en ms. Obligatorio y no vacío — el backend responde 400 MISSING_SUBTITLES si falta. */
export interface MetadataContext {
  subtitles: { start: number; end: number; text: string }[]
  summary?: string
  detectedReason?: string
  score?: number
}

export interface GenerateMetadataParams {
  sourceId: string
  /** Campos genéricos, iguales para toda la serie — si vienen vacíos, el backend deja explícito que la IA debe inferirlos del context. */
  topic?: string
  tone?: string
  additionalInstructions?: string
  feedback?: string
  context: MetadataContext
}

export type VideoType = 'long' | 'short'

/** Solo TikTok lo usa hoy (privacyLevel) — null para YouTube (el campo debe existir igual, el backend lo exige). */
export interface PublishItemPlatformOptions {
  privacyLevel?: string
}

/**
 * Plan de un item del bulk — ya NO lleva el archivo (eso va aparte, por TUS,
 * ver TusUploadPort). priority/longVideoTimestampSec/longVideoUrl deben
 * existir siempre en el JSON aunque sean null (el backend los exige
 * presentes, a diferencia del contrato viejo donde se omitían).
 * platformOptionsByPlatform es un mapa con una entrada por cada plataforma
 * del bulk — null para la plataforma que no tiene opciones especiales.
 */
export interface PublishItemPlan {
  sourceId: string
  videoType: VideoType
  metadataRevisionId: string
  /** Tamaño del archivo en bytes — obligatorio, el backend lo valida antes de aceptar el plan. */
  videoSizeBytes: number
  /** Orden de prioridad entre items del mismo bulk (0–1) — null si no aplica. */
  priority: number | null
  /** Segundo exacto donde arranca este short dentro del video largo — null si no hay video largo asociado (ej. el item es el propio largo). */
  longVideoTimestampSec: number | null
  /** Solo hace falta si el video largo NO viene en este mismo bulk — null si el largo viaja en el mismo lote o no aplica. */
  longVideoUrl: string | null
  platformOptionsByPlatform: Partial<Record<PublishingPlatform, PublishItemPlatformOptions | null>>
}

/** 'unknown' cubre un status que el backend agregó después de esta versión del frontend — nunca debe tratarse igual que 'failed' (no es un fallo, es un status que este cliente todavía no sabe interpretar). 'inbox' = TikTok recibió el video como borrador en la bandeja de TikTok Studio (backend reintentó automáticamente tras un rechazo de privacidad) — no es un fallo. 'skipped' = TikTok descarta sin subir un item videoType:'long' (TikTok nunca sube el video largo) — tampoco es un fallo. 'awaiting_result' = el archivo ya terminó de subir por TUS, pero el backend todavía no confirmó el resultado final (no hay respuesta síncrona en el flujo nuevo — llega por notificación) — es local al frontend, el backend nunca lo manda. */
export type PublishItemStatus =
  | 'uploading'
  | 'awaiting_result'
  | 'uploaded'
  | 'scheduled'
  | 'inbox'
  | 'skipped'
  | 'failed'
  | 'unknown'

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

/**
 * videoUrl llega ya resuelta por el backend (vía notificación video_published/
 * tiktok_draft_ready) — a diferencia del contrato viejo, que mandaba un
 * platformVideoId crudo y dejaba que el frontend construyera la URL a mano
 * (y solo sabía hacerlo para YouTube). Con la URL resuelta, el frontend no
 * necesita saber nada del formato de URL de cada plataforma.
 */
export interface PublishItemResult {
  sourceId: string
  platform: PublishingPlatform
  status: PublishItemStatus
  videoUrl: string | null
  error: PublishItemError | null
}

/**
 * Paso 1 del flujo — declara el plan completo (puede cubrir varias
 * plataformas a la vez) sin mandar ningún archivo. El backend responde con
 * una uploadUrl (TUS) por sourceId; recién el paso 2 sube los binarios.
 */
export interface BulkUploadPlanParams {
  seriesId: string
  timeZone: string
  /** Fecha ISO propuesta para el video largo — opcional; si se omite, el backend calendariza automáticamente. */
  longVideoPublishDay?: string
  platforms: PublishingPlatform[]
  items: PublishItemPlan[]
}

/** Blob a subir por TUS para un sourceId — un solo binario por source, aunque se publique a varias plataformas (ver BulkUploadPlanParams.platforms). */
export interface BulkUploadVideo {
  sourceId: string
  blob: Blob
  fileName: string
}

/**
 * uploadedPlatforms (antes alreadyPublishedPlatforms — el backend lo renombró
 * porque el nombre viejo sugería "ya publicado", cuando en realidad solo
 * significa "el archivo ya está subido"; nunca incluye plataformas en
 * AwaitingUpload/Scheduled/Publishing/Inbox) tiene dos causas posibles,
 * distinguibles por uploadUrl:
 * - uploadUrl no-null, uploadedPlatforms vacío: nada subido todavía para
 *   ninguna plataforma de este plan — sigue el flujo normal de subida.
 * - uploadUrl null, uploadedPlatforms no vacío: el archivo YA está subido
 *   para esas plataformas (de un intento anterior, de CUALQUIER bulk) — el
 *   resultado de PUBLICACIÓN sigue sin resolver y llega por notificación SSE
 *   como cualquier otro, uploadedPlatforms no implica 'uploaded'/'scheduled'
 *   como status final, solo que no hace falta volver a subir el binario.
 */
export interface BulkUploadPlanUpload {
  sourceId: string
  uploadUrl: string | null
  uploadedPlatforms: PublishingPlatform[]
}

export interface BulkUploadPlanResult {
  bulkUploadId: string
  uploads: BulkUploadPlanUpload[]
}

/** Estado de la subida de un archivo dentro del bulk — 'uploading' cubre tanto "sigue subiendo" como "nunca empezó", el frontend no necesita distinguirlos porque ambos casos se resuelven igual (reenviar el plan). */
export type BulkUploadItemUploadStatus = 'uploading' | 'completed'

/** Estado de publicación de un item en UNA plataforma concreta — vocabulario propio del endpoint de status, no es PublishItemStatus (ese es el status final que llega por notificación; este describe también las fases intermedias 'awaiting_upload'/'publishing' que ocurren antes de que exista un resultado). */
export type BulkUploadItemPlatformStatus = 'awaiting_upload' | 'publishing' | 'uploaded' | 'scheduled' | 'inbox' | 'failed'

export interface BulkUploadStatusItemPlatform {
  platform: PublishingPlatform
  status: BulkUploadItemPlatformStatus
}

export interface BulkUploadStatusItem {
  sourceId: string
  uploadStatus: BulkUploadItemUploadStatus
  platforms: BulkUploadStatusItemPlatform[]
}

/**
 * 'active' = sigue subiendo archivos — es el ÚNICO estado no terminal, y el
 * único donde "falta algo por subir" tiene sentido (ver uso en
 * PublishingPage: cualquier status !== 'active' significa que la subida ya
 * terminó, sin importar cómo haya ido la publicación).
 * 'uploaded' = todos los binarios ya están en el servidor, publicación recién
 * arrancando (breaking change: esto es lo que el backend llamaba 'completed'
 * antes).
 * 'publishing' = hay publicaciones en curso o con fallos todavía
 * reintentables automáticamente por el backend.
 * 'completed' = TERMINAL, todas las plataformas de todos los items quedaron
 * publicadas con éxito (significado NUEVO de este valor — antes 'completed'
 * era "terminó de subir", ahora es "publicó bien en todo").
 * 'completed_with_failures' = TERMINAL, no queda nada pendiente pero algún
 * item quedó 'failed' sin resolver — candidato para el botón "Reintentar
 * fallidos" (ver PublishingUseCase.retryFailedPublications).
 * 'expired' = 7 días sin actividad, el backend lo dio de baja — equivalente a
 * que no exista, salvo que GET sigue devolviendo el registro en vez de 404.
 */
export type BulkUploadOverallStatus = 'active' | 'uploaded' | 'publishing' | 'completed' | 'completed_with_failures' | 'expired'

export interface BulkUploadStatus {
  bulkUploadId: string
  status: BulkUploadOverallStatus
  items: BulkUploadStatusItem[]
}

/**
 * Metadata generada para un source — UNA sola, compartida entre plataformas
 * (el backend genera un único título/descripción/tags vía
 * POST /api/publishing/youtube/generate-metadata sin importar a qué
 * plataforma se vaya a publicar, y él mismo la adapta por plataforma al
 * publicar). Keyed solo por sourceId, nunca por platform — persistir esto
 * bajo una clave con plataforma duplicaría la misma metadata en dos
 * registros en vez de reflejar que es un único dato.
 */
export interface PublishedMetadataRecord {
  sourceId: string
  revision: MetadataRevision
  updatedAt: string
}

/**
 * Resultado de un intento de publicación — este sí es uno POR PLATAFORMA: un
 * mismo source puede estar publicado en YouTube y pendiente en TikTok a la
 * vez. Keyed por `${platform}::${sourceId}` (ver publishedResultKey).
 */
export interface PublishedResultRecord {
  sourceId: string
  platform: PublishingPlatform
  result: PublishItemResult
  updatedAt: string
}

/** Un proyecto = una serie (video largo + sus shorts) publicable en varias plataformas. metadataBySourceId es una entrada por source (sourceId = projectId para el largo, projectId::short::<key> para cada short); resultsByKey es una entrada por intento de publicación por plataforma. manualLongVideoUrl es el default editable del campo "URL del video completo" (PublishingPage) — se pisa con la URL real apenas el largo se publica de verdad, para no tener dos fuentes de verdad distintas. Vive en su propio storage, no en ProjectShorts, porque el video largo no es un short. Resumir un bulk a medias NO requiere persistencia local propia — el backend es la fuente de verdad (reenviar el mismo plan basta, ver BulkUploadPlanUpload.uploadUrl). */
export interface ProjectPublishing {
  projectId: string
  metadataBySourceId: Record<string, PublishedMetadataRecord>
  resultsByKey: Record<string, PublishedResultRecord>
  manualLongVideoUrl?: string
}

export function publishedResultKey(platform: PublishingPlatform, sourceId: string): string {
  return `${platform}::${sourceId}`
}

export function buildPublishedMetadataRecord(sourceId: string, revision: MetadataRevision): PublishedMetadataRecord {
  return { sourceId, revision, updatedAt: new Date().toISOString() }
}

export function buildPublishedResultRecord(sourceId: string, platform: PublishingPlatform, result: PublishItemResult): PublishedResultRecord {
  return { sourceId, platform, result, updatedAt: new Date().toISOString() }
}

export type PublishingResultNotification = Notification & { type: 'video_published' | 'video_upload_failed' | 'tiktok_draft_ready' }

export function isPublishingResultNotification(notification: Notification): notification is PublishingResultNotification {
  return notification.type === 'video_published' || notification.type === 'video_upload_failed' || notification.type === 'tiktok_draft_ready'
}

/**
 * Traduce una notificación SSE de resultado de publicación a PublishItemResult
 * — único punto que conoce este mapeo, reusado tanto por PublishingUseCase
 * (persiste en IndexedDB) como por usePublish (refleja en memoria sin esperar
 * un reload). tiktok_draft_ready no es un fallo: el video quedó como borrador
 * en la bandeja de TikTok Studio, pendiente de confirmación manual.
 */
export function toPublishItemResultFromNotification(notification: PublishingResultNotification): {
  projectId: string
  sourceId: string
  result: PublishItemResult
} {
  const { seriesId: projectId, sourceId } = notification.data
  const result: PublishItemResult =
    notification.type === 'video_published'
      ? { sourceId, platform: notification.data.platform, status: 'uploaded', videoUrl: notification.data.videoUrl, error: null }
      : notification.type === 'video_upload_failed'
        ? {
            sourceId,
            platform: notification.data.platform,
            status: 'failed',
            videoUrl: null,
            error: notification.data.failReason ? { kind: PublishItemErrorKind.Freeform, message: notification.data.failReason } : null,
          }
        : { sourceId, platform: 'tiktok', status: 'inbox', videoUrl: notification.data.tikTokInboxUrl, error: null }
  return { projectId, sourceId, result }
}
