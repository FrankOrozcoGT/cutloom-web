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

export interface MetadataDto {
  title: string
  description: string
  tags: string[]
  categoryId: string
  thumbnailIdeas: string[]
}

export interface GenerateMetadataResponseDto {
  revisionId: string
  version: number
  metadata: MetadataDto
}

export interface PublishItemResultDto {
  sourceId: string
  status: string
  youtubeVideoId: string | null
  url: string | null
  error: string | null
}

export interface BulkUploadResponseDto {
  results: PublishItemResultDto[]
}

function mapMetadata(dto: MetadataDto): YouTubeMetadata {
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

function mapPublishItemResult(dto: PublishItemResultDto): PublishItemResult {
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
