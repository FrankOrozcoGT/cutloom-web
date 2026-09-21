import { z } from 'zod'
import {
  toPublishItemError,
  type BulkUploadResult,
  type MetadataRevision,
  type PublishItemResult,
  type PublishItemStatus,
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

const publishItemResultSchema = z.object({
  sourceId: z.string(),
  status: z.string(),
  youtubeVideoId: z.string().nullable(),
  url: z.string().nullable(),
  error: z.string().nullable(),
})

export const bulkUploadResponseSchema = z.object({ results: z.array(publishItemResultSchema) })
export type BulkUploadResponseDto = z.infer<typeof bulkUploadResponseSchema>

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

const PUBLISH_ITEM_STATUSES: readonly PublishItemStatus[] = ['uploading', 'uploaded', 'scheduled', 'failed', 'unknown']

function mapPublishItemStatus(status: string): PublishItemStatus {
  const match = PUBLISH_ITEM_STATUSES.find((known) => known === status)
  return match ?? 'unknown'
}

function mapPublishItemResult(dto: z.infer<typeof publishItemResultSchema>): PublishItemResult {
  return {
    sourceId: dto.sourceId,
    status: mapPublishItemStatus(dto.status),
    youtubeVideoId: dto.youtubeVideoId,
    url: dto.url,
    error: dto.error ? toPublishItemError(dto.error) : null,
  }
}

export function mapBulkUploadResult(dto: BulkUploadResponseDto): BulkUploadResult {
  return { results: dto.results.map(mapPublishItemResult) }
}

const KNOWN_ERROR_CODES: readonly PublishingErrorCode[] = [
  'FEATURE_ACCESS_DENIED',
  'INVALID_PAYLOAD',
  'MISSING_TOPIC',
  'NO_YOUTUBE_CONNECTION',
  'TOO_MANY_VIDEOS',
  'VIDEO_FILE_TOO_LARGE',
  'METADATA_REVISION_NOT_FOUND',
  'METADATA_REVISION_SOURCE_MISMATCH',
  'SCHEDULE_CAPACITY_EXCEEDED',
  'NETWORK_ERROR',
  'UNKNOWN_ERROR',
]

export function mapPublishingError(code: string, message?: string): PublishingError {
  return mapKnownError(KNOWN_ERROR_CODES, (c, m) => new PublishingError(c, m), code, message)
}
