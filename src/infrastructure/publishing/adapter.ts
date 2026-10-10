import type { BulkUploadPlanParams, BulkUploadPlanResult, BulkUploadStatus, GenerateMetadataParams, MetadataRevision } from '@domain/publishing'
import type { PublishingBackendPort } from '@application/publishing/ports'
import { PublishingError } from '@application/publishing/errors'
import { err, ok, type Result } from '@application/result'
import type { HttpClient } from '@infrastructure/http/client'
import { parseErrorBody, parseJson } from '@infrastructure/http/parseJson'
import {
  bulkUploadPlanResponseSchema,
  bulkUploadStatusResponseSchema,
  generateMetadataResponseSchema,
  mapBulkUploadPlanResult,
  mapBulkUploadStatus,
  mapMetadataRevision,
  mapPublishingError,
} from './mappers'

/**
 * El input type="date" de PublishSchedule entrega "YYYY-MM-DD" (fecha local,
 * sin hora) — el backend exige un ISO datetime completo. new Date("YYYY-MM-DD")
 * interpretaría eso como medianoche UTC, no medianoche local, corriendo la
 * fecha un día para cualquiera al oeste de UTC — se arma el Date a mano a
 * partir de los componentes para que sea medianoche en la zona horaria real
 * del usuario (la misma que ya viaja aparte en timeZone).
 */
function toIsoDateTime(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toISOString()
}

export class PublishingApiAdapter implements PublishingBackendPort {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async generateMetadata(params: GenerateMetadataParams): Promise<Result<MetadataRevision, PublishingError>> {
    const response = await this.http.post('/api/publishing/youtube/generate-metadata', params)
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = await parseJson(response, generateMetadataResponseSchema)
    return ok(mapMetadataRevision(body))
  }

  /** Paso 1 del flujo bulk-upload — declara el plan en JSON puro (sin archivos, sin :platform en la URL: un bulk puede cubrir varias plataformas). Devuelve una uploadUrl (TUS) por sourceId; los binarios se suben aparte (ver TusUploadAdapter). */
  async bulkUploadPlan(params: BulkUploadPlanParams): Promise<Result<BulkUploadPlanResult, PublishingError>> {
    const response = await this.http.post('/api/publishing/bulk-upload', {
      seriesId: params.seriesId,
      timeZone: params.timeZone,
      longVideoPublishDay: params.longVideoPublishDay ? toIsoDateTime(params.longVideoPublishDay) : null,
      platforms: params.platforms,
      items: params.items,
    })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = await parseJson(response, bulkUploadPlanResponseSchema)
    return ok(mapBulkUploadPlanResult(body))
  }

  /** Cancela explícitamente el bulk activo de una serie — deja el seriesId libre para un plan nuevo. 204 sin body si se canceló. */
  async cancelBulkUpload(seriesId: string): Promise<Result<void, PublishingError>> {
    const response = await this.http.delete(`/api/publishing/bulk-upload/${seriesId}`)
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    return ok(undefined)
  }

  /** Consulta el estado real de un bulk sin modificarlo — encuentra el bulk sin importar su estado. */
  async getBulkUploadStatus(seriesId: string): Promise<Result<BulkUploadStatus, PublishingError>> {
    const response = await this.http.get(`/api/publishing/bulk-upload/${seriesId}/status`)
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = await parseJson(response, bulkUploadStatusResponseSchema)
    return ok(mapBulkUploadStatus(body))
  }

  /** Reintenta todos los videos 'failed' de un bulk — nota: usa bulkUploadId, no seriesId (único endpoint de bulk-upload con esa diferencia). 204 sin body si se disparó el reintento. */
  async retryFailedPublications(bulkUploadId: string): Promise<Result<void, PublishingError>> {
    const response = await this.http.post(`/api/publishing/bulk-upload/${bulkUploadId}/retry-failed`)
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    return ok(undefined)
  }

  private async parseError(response: Response): Promise<PublishingError> {
    const body = await parseErrorBody(response)
    return mapPublishingError(body?.error ?? 'UNKNOWN_ERROR', body?.message)
  }
}
