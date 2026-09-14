import type { BulkUploadParams, BulkUploadResult, GenerateMetadataParams, MetadataRevision } from '@domain/publishing'
import type { Result } from '@application/result'
import type { PublishingError } from './errors'

export interface PublishingBackendPort {
  generateMetadata(params: GenerateMetadataParams): Promise<Result<MetadataRevision, PublishingError>>
  bulkUpload(params: BulkUploadParams): Promise<Result<BulkUploadResult, PublishingError>>
}
