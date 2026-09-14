import type { BulkUploadParams, BulkUploadResult, GenerateMetadataParams, MetadataRevision } from '@domain/publishing'
import type { PublishingBackendPort } from '@application/publishing/ports'
import { PublishingError } from '@application/publishing/errors'
import { err, ok, type Result } from '@application/result'
import type { HttpClient } from '@infrastructure/http/client'
import {
  mapBulkUploadResult,
  mapMetadataRevision,
  mapPublishingError,
  type BulkUploadResponseDto,
  type GenerateMetadataResponseDto,
} from './mappers'

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
    const body = (await response.json()) as GenerateMetadataResponseDto
    return ok(mapMetadataRevision(body))
  }

  async bulkUpload(params: BulkUploadParams): Promise<Result<BulkUploadResult, PublishingError>> {
    const formData = new FormData()
    // Orden crítico: 'payload' debe ir antes que los archivos, o el backend responde INVALID_PAYLOAD.
    // longVideoPublishDay es opcional — se omite del payload en vez de mandar '' cuando el usuario no eligió fecha.
    formData.append(
      'payload',
      JSON.stringify({
        seriesId: params.seriesId,
        timeZone: params.timeZone,
        ...(params.longVideoPublishDay ? { longVideoPublishDay: params.longVideoPublishDay } : {}),
        items: params.items,
      }),
    )
    for (const video of params.videos) {
      formData.append(`video_${video.sourceId}`, video.blob, video.fileName)
    }

    const response = await this.http.postForm('/api/publishing/youtube/bulk-upload', formData)
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as BulkUploadResponseDto
    return ok(mapBulkUploadResult(body))
  }

  private async parseError(response: Response): Promise<PublishingError> {
    try {
      const body = (await response.json()) as { error?: string; message?: string }
      return mapPublishingError(body.error ?? 'UNKNOWN_ERROR', body.message)
    } catch {
      return mapPublishingError('UNKNOWN_ERROR')
    }
  }
}
