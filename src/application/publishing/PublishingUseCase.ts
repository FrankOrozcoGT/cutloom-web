import {
  buildPublishedSourceRecord,
  type BulkUploadParams,
  type BulkUploadResult,
  type GenerateMetadataParams,
  type MetadataRevision,
  type PublishItemResult,
} from '@domain/publishing'
import type { Result } from '@application/result'
import type { PublishingError } from './errors'
import type { PublishingBackendPort, PublishingStoragePort } from './ports'

/**
 * Orquesta generar metadata / subir a YouTube junto con la persistencia del
 * registro por source — el patrón "llamar al backend y, si tuvo éxito,
 * persistir el resultado en el store local" se repetía tres veces en
 * usePublishYouTube (generateAllMetadata, regenerateMetadata, el loop final
 * de publish), cada una construyendo su propio PublishedSourceRecord a mano.
 * El hook sigue siendo dueño del estado de UI (máquina de estados por item,
 * progreso del wizard) — este caso de uso es la única fuente de la lógica de
 * negocio pura detrás de cada paso.
 */
export class PublishingUseCase {
  private readonly api: PublishingBackendPort
  private readonly storage: PublishingStoragePort

  constructor(api: PublishingBackendPort, storage: PublishingStoragePort) {
    this.api = api
    this.storage = storage
  }

  /** Genera una revisión de metadata y persiste el registro del source — previousResult se reenvía tal cual porque generar metadata nueva no cambia el estado de un upload ya realizado. */
  async generateMetadata(
    projectId: string,
    params: GenerateMetadataParams,
    previousResult: PublishItemResult | null,
  ): Promise<Result<MetadataRevision, PublishingError>> {
    const result = await this.api.generateMetadata(params)
    if (!result.ok) return result
    await this.storage.upsertSource(projectId, buildPublishedSourceRecord(params.sourceId, result.value, previousResult))
    return result
  }

  async bulkUpload(params: BulkUploadParams): Promise<Result<BulkUploadResult, PublishingError>> {
    return this.api.bulkUpload(params)
  }

  /** Persiste el resultado de un upload contra la revisión que se usó para publicarlo — llamado una vez por item tras un bulkUpload exitoso. */
  async recordUploadResult(projectId: string, sourceId: string, revision: MetadataRevision, result: PublishItemResult): Promise<void> {
    await this.storage.upsertSource(projectId, buildPublishedSourceRecord(sourceId, revision, result))
  }
}
