import type {
  BulkUploadPlanParams,
  BulkUploadPlanResult,
  BulkUploadStatus,
  GenerateMetadataParams,
  MetadataRevision,
  PublishedMetadataRecord,
  PublishedResultRecord,
  ProjectPublishing,
} from '@domain/publishing'
import type { Result } from '@application/result'
import type { PublishingError } from './errors'

export interface PublishingBackendPort {
  generateMetadata(params: GenerateMetadataParams): Promise<Result<MetadataRevision, PublishingError>>
  /** Paso 1 del bulk-upload — declara el plan (sin archivos) y devuelve una uploadUrl TUS por sourceId (null si ese archivo ya terminó de subir, ver BulkUploadPlanUpload). Reenviar el mismo seriesId/items resume automáticamente un bulk ya activo. Los binarios se suben aparte vía TusUploadPort. */
  bulkUploadPlan(params: BulkUploadPlanParams): Promise<Result<BulkUploadPlanResult, PublishingError>>
  /** Cancela explícitamente el bulk activo de una serie (aborta uploads TUS pendientes, marca fallidos los videos que esperaban subir) — deja el seriesId libre para un plan completamente nuevo. BULK_UPLOAD_NOT_FOUND si no había ningún bulk activo. */
  cancelBulkUpload(seriesId: string): Promise<Result<void, PublishingError>>
  /** Consulta el estado real de un bulk sin modificarlo — encuentra el bulk sin importar su estado (activo, terminado, con fallos), útil tanto para ofrecer "continuar/empezar de nuevo" como para mostrar resultados después de terminar. BULK_UPLOAD_NOT_FOUND si nunca existió uno. */
  getBulkUploadStatus(seriesId: string): Promise<Result<BulkUploadStatus, PublishingError>>
  /** Reintenta todos los PublishedVideo en estado 'failed' de un bulk (identificado por bulkUploadId, no seriesId) contra su plataforma correspondiente — el backend decide cuáles, no hace falta indicarlos. 204 no trae body: hay que volver a llamar getBulkUploadStatus después para ver el resultado. */
  retryFailedPublications(bulkUploadId: string): Promise<Result<void, PublishingError>>
}

export type PublishingStorageError = 'STORAGE_ERROR' | 'CORRUPTED_DATA'

export interface PublishingStoragePort {
  getByProject(projectId: string): Promise<Result<ProjectPublishing | null, PublishingStorageError>>
  /** Crea o actualiza la metadata de un source — keyed solo por sourceId, compartida entre plataformas, sin pisar el resto de la serie persistida. */
  upsertMetadata(projectId: string, sourceId: string, record: PublishedMetadataRecord): Promise<Result<void, PublishingStorageError>>
  /** Crea o actualiza el resultado de un intento de publicación bajo `key` (compuesta `${platform}::${sourceId}`, ver publishedResultKey) sin pisar el resto de la serie persistida. */
  upsertResult(projectId: string, key: string, record: PublishedResultRecord): Promise<Result<void, PublishingStorageError>>
  /** Crea o actualiza el default del campo "URL del video completo" sin pisar el resto de la serie persistida. url vacío/undefined borra el default. */
  upsertManualLongVideoUrl(projectId: string, url: string | undefined): Promise<Result<void, PublishingStorageError>>
  deleteByProject(projectId: string): Promise<Result<void, PublishingStorageError>>
}
