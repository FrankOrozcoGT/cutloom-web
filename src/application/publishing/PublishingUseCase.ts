import {
  buildPublishedMetadataRecord,
  buildPublishedResultRecord,
  publishedResultKey,
  toPublishItemResultFromNotification,
  type BulkUploadPlanParams,
  type BulkUploadPlanResult,
  type BulkUploadStatus,
  type GenerateMetadataParams,
  type MetadataRevision,
  type PublishingResultNotification,
  type PublishItemResult,
} from '@domain/publishing'
import type { PublishingPlatform } from '@domain/platform'
import type { Result } from '@application/result'
import type { TusUploadError, TusUploadParams } from '@infrastructure/publishing/tusUploadAdapter'
import type { PublishingError } from './errors'
import type { PublishingBackendPort, PublishingStoragePort } from './ports'

export interface TusUploadPort {
  upload(params: TusUploadParams): Promise<Result<void, TusUploadError>>
}

/**
 * Orquesta generar metadata / declarar el plan de bulk-upload / subir cada
 * archivo por TUS, junto con la persistencia local de cada paso — el patrón
 * "llamar al backend y, si tuvo éxito, persistir el resultado en el store
 * local" se repetía a mano en usePublish; el hook sigue siendo dueño del
 * estado de UI (máquina de estados por item, progreso del wizard), este caso
 * de uso es la única fuente de la lógica de negocio pura detrás de cada paso.
 * Resumir un bulk a medias NO necesita estado local propio — el backend es
 * la única fuente de verdad: reenviar el mismo plan (mismo seriesId, mismos
 * sourceId) basta, y cada uploadUrl de la respuesta ya refleja qué falta
 * (null = ese archivo ya terminó, ver BulkUploadPlanUpload).
 */
export class PublishingUseCase {
  private readonly api: PublishingBackendPort
  private readonly storage: PublishingStoragePort
  private readonly tus: TusUploadPort

  constructor(api: PublishingBackendPort, storage: PublishingStoragePort, tus: TusUploadPort) {
    this.api = api
    this.storage = storage
    this.tus = tus
  }

  /** Genera una revisión de metadata y la persiste — la metadata es UNA sola, compartida entre plataformas (mismo endpoint sin importar a qué plataforma se vaya a publicar), así que se guarda keyed solo por sourceId, nunca por plataforma. */
  async generateMetadata(
    projectId: string,
    params: GenerateMetadataParams,
  ): Promise<Result<MetadataRevision, PublishingError>> {
    const result = await this.api.generateMetadata(params)
    if (!result.ok) return result
    await this.storage.upsertMetadata(projectId, params.sourceId, buildPublishedMetadataRecord(params.sourceId, result.value))
    return result
  }

  /** Paso 1 — declara el plan (puede cubrir varias plataformas a la vez) y devuelve una uploadUrl TUS por sourceId (null si ese archivo ya terminó de subir). Reenviar el mismo plan para un seriesId con un bulk ya activo resume automáticamente — no hace falta ningún manejo especial de "ya existe". */
  async planBulkUpload(params: BulkUploadPlanParams): Promise<Result<BulkUploadPlanResult, PublishingError>> {
    return this.api.bulkUploadPlan(params)
  }

  /** Cancela explícitamente el bulk activo de una serie — deja el seriesId libre para declarar un plan completamente nuevo. */
  async cancelBulkUpload(seriesId: string): Promise<Result<void, PublishingError>> {
    return this.api.cancelBulkUpload(seriesId)
  }

  /** Consulta el estado real de un bulk para decidir si ofrecer "continuar/empezar de nuevo" (status 'active') o "reintentar fallidos" (status 'completed_with_failures') — encuentra el bulk sin importar su estado, incluso ya terminado. */
  async getBulkUploadStatus(seriesId: string): Promise<Result<BulkUploadStatus, PublishingError>> {
    return this.api.getBulkUploadStatus(seriesId)
  }

  /** Reintenta todos los videos 'failed' de un bulk — usa bulkUploadId (de planBulkUpload o getBulkUploadStatus), no seriesId. El caller debe volver a llamar getBulkUploadStatus después para ver si el reintento tuvo éxito. */
  async retryFailedPublications(bulkUploadId: string): Promise<Result<void, PublishingError>> {
    return this.api.retryFailedPublications(bulkUploadId)
  }

  /** Paso 2 — sube un archivo por TUS a su uploadUrl, reportando progreso real. tus-js-client retoma solo desde el offset real si la uploadUrl ya tenía bytes subidos (HEAD automático al iniciar), sin que el frontend necesite saber nada de eso de antemano. */
  async uploadFile(
    uploadUrl: string,
    file: Blob,
    fileName: string,
    onProgress: (bytesUploaded: number, bytesTotal: number) => void,
  ): Promise<Result<void, TusUploadError>> {
    return this.tus.upload({ uploadUrl, file, fileName, onProgress })
  }

  /** Persiste el resultado de un upload, keyed por platform::sourceId para no pisar el resultado de la otra plataforma — seriesId de la notificación es el mismo valor que projectId (mismo concepto, nombre distinto en el wire, ver BulkUploadPlanParams.seriesId). */
  async recordUploadResult(projectId: string, platform: PublishingPlatform, sourceId: string, result: PublishItemResult): Promise<void> {
    await this.storage.upsertResult(projectId, publishedResultKey(platform, sourceId), buildPublishedResultRecord(sourceId, platform, result))
  }

  /**
   * Persiste el resultado de una notificación SSE (ver toPublishItemResultFromNotification
   * para el mapeo notificación→dominio, reusado también por usePublish para reflejar en
   * memoria sin esperar un reload).
   */
  async recordNotificationResult(notification: PublishingResultNotification): Promise<void> {
    const { projectId, sourceId, result } = toPublishItemResultFromNotification(notification)
    await this.recordUploadResult(projectId, result.platform, sourceId, result)

    // sourceId del video largo es siempre el propio projectId (ver convención en
    // PublishingPage/usePublish) — si se publicó de verdad, esa URL real pasa a ser
    // el default del campo manual, para que no queden dos fuentes de verdad distintas.
    if (sourceId === projectId && result.videoUrl) {
      await this.setManualLongVideoUrl(projectId, result.videoUrl)
    }
  }

  /** Persiste el default editable del campo "URL del video completo" — mismo storage de donde se lee, para que no haya dos fuentes de verdad distintas entre lo que el usuario escribe a mano y la URL real una vez que el largo se publica. */
  async setManualLongVideoUrl(projectId: string, url: string | undefined): Promise<void> {
    await this.storage.upsertManualLongVideoUrl(projectId, url)
  }
}
