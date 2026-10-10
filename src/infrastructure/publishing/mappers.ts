import { z } from 'zod'
import {
  type BulkUploadItemPlatformStatus,
  type BulkUploadItemUploadStatus,
  type BulkUploadOverallStatus,
  type BulkUploadPlanResult,
  type BulkUploadStatus,
  type MetadataRevision,
  type YouTubeMetadata,
} from '@domain/publishing'
import type { PublishingErrorCode } from '@application/publishing/errors'
import { PublishingError } from '@application/publishing/errors'
import { mapKnownError } from '@infrastructure/errors'

const metadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  categoryId: z.string(),
  thumbnailIdeas: z.array(z.string()),
})

export const generateMetadataResponseSchema = z.object({
  revisionId: z.string(),
  version: z.number(),
  metadata: metadataSchema,
})
export type GenerateMetadataResponseDto = z.infer<typeof generateMetadataResponseSchema>

function mapMetadata(dto: z.infer<typeof metadataSchema>): YouTubeMetadata {
  return {
    title: dto.title,
    description: dto.description,
    tags: dto.tags,
    categoryId: dto.categoryId,
    thumbnailIdeas: dto.thumbnailIdeas,
  }
}

export function mapMetadataRevision(dto: GenerateMetadataResponseDto): MetadataRevision {
  return {
    revisionId: dto.revisionId,
    version: dto.version,
    metadata: mapMetadata(dto.metadata),
  }
}

const bulkUploadPlanUploadSchema = z.object({
  sourceId: z.string(),
  uploadUrl: z.string().nullable(),
  uploadedPlatforms: z.array(z.union([z.literal('youtube'), z.literal('tiktok')])),
})

export const bulkUploadPlanResponseSchema = z.object({
  bulkUploadId: z.string(),
  uploads: z.array(bulkUploadPlanUploadSchema),
})
export type BulkUploadPlanResponseDto = z.infer<typeof bulkUploadPlanResponseSchema>

export function mapBulkUploadPlanResult(dto: BulkUploadPlanResponseDto): BulkUploadPlanResult {
  return { bulkUploadId: dto.bulkUploadId, uploads: dto.uploads }
}

const BULK_UPLOAD_ITEM_UPLOAD_STATUSES: readonly BulkUploadItemUploadStatus[] = ['uploading', 'completed']
const BULK_UPLOAD_ITEM_PLATFORM_STATUSES: readonly BulkUploadItemPlatformStatus[] = [
  'awaiting_upload',
  'publishing',
  'uploaded',
  'scheduled',
  'inbox',
  'failed',
]
const BULK_UPLOAD_OVERALL_STATUSES: readonly BulkUploadOverallStatus[] = [
  'active',
  'uploaded',
  'publishing',
  'completed',
  'completed_with_failures',
  'expired',
]

export const bulkUploadStatusResponseSchema = z.object({
  bulkUploadId: z.string(),
  status: z.enum(BULK_UPLOAD_OVERALL_STATUSES as [BulkUploadOverallStatus, ...BulkUploadOverallStatus[]]),
  items: z.array(
    z.object({
      sourceId: z.string(),
      uploadStatus: z.enum(BULK_UPLOAD_ITEM_UPLOAD_STATUSES as [BulkUploadItemUploadStatus, ...BulkUploadItemUploadStatus[]]),
      platforms: z.array(
        z.object({
          platform: z.union([z.literal('youtube'), z.literal('tiktok')]),
          status: z.enum(BULK_UPLOAD_ITEM_PLATFORM_STATUSES as [BulkUploadItemPlatformStatus, ...BulkUploadItemPlatformStatus[]]),
        }),
      ),
    }),
  ),
})
export type BulkUploadStatusResponseDto = z.infer<typeof bulkUploadStatusResponseSchema>

export function mapBulkUploadStatus(dto: BulkUploadStatusResponseDto): BulkUploadStatus {
  return dto
}

const KNOWN_ERROR_CODES: readonly PublishingErrorCode[] = [
  'FEATURE_ACCESS_DENIED',
  'INVALID_PAYLOAD',
  'INVALID_REQUEST',
  'MISSING_SUBTITLES',
  'NO_PLATFORM_CONNECTION',
  'TOO_MANY_VIDEOS',
  'VIDEO_FILE_TOO_LARGE',
  'METADATA_REVISION_NOT_FOUND',
  'METADATA_REVISION_SOURCE_MISMATCH',
  'SCHEDULE_CAPACITY_EXCEEDED',
  'VIDEO_UPLOAD_REJECTED',
  'PLATFORM_TOKEN_EXPIRED',
  'RATE_LIMITED',
  'ACTIVE_UPLOAD_ALREADY_EXISTS',
  'BULK_UPLOAD_ALREADY_ACTIVE',
  'BULK_UPLOAD_NOT_FOUND',
  'MISSING_ORGANIZATION',
  'NETWORK_ERROR',
  'UNKNOWN_ERROR',
]

export function mapPublishingError(code: string, message?: string): PublishingError {
  return mapKnownError(KNOWN_ERROR_CODES, (c, m) => new PublishingError(c, m), code, message)
}
