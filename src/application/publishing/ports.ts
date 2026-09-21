import type {
  BulkUploadParams,
  BulkUploadResult,
  GenerateMetadataParams,
  MetadataRevision,
  PublishedSourceRecord,
  ProjectPublishing,
} from '@domain/publishing'
import type { Result } from '@application/result'
import type { PublishingError } from './errors'

export interface PublishingBackendPort {
  generateMetadata(params: GenerateMetadataParams): Promise<Result<MetadataRevision, PublishingError>>
  bulkUpload(params: BulkUploadParams): Promise<Result<BulkUploadResult, PublishingError>>
}

export type PublishingStorageError = 'STORAGE_ERROR' | 'CORRUPTED_DATA'

export interface PublishingStoragePort {
  getByProject(projectId: string): Promise<Result<ProjectPublishing | null, PublishingStorageError>>
  /** Crea o actualiza el registro de un source sin pisar el resto de la serie persistida. */
  upsertSource(projectId: string, record: PublishedSourceRecord): Promise<Result<void, PublishingStorageError>>
  deleteByProject(projectId: string): Promise<Result<void, PublishingStorageError>>
}
