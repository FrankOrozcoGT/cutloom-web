export type PublishingErrorCode =
  | 'FEATURE_ACCESS_DENIED'
  | 'INVALID_PAYLOAD'
  | 'INVALID_REQUEST'
  | 'MISSING_SUBTITLES'
  | 'NO_PLATFORM_CONNECTION'
  | 'TOO_MANY_VIDEOS'
  | 'VIDEO_FILE_TOO_LARGE'
  | 'METADATA_REVISION_NOT_FOUND'
  | 'METADATA_REVISION_SOURCE_MISMATCH'
  | 'SCHEDULE_CAPACITY_EXCEEDED'
  | 'VIDEO_UPLOAD_REJECTED'
  | 'PLATFORM_TOKEN_EXPIRED'
  | 'RATE_LIMITED'
  | 'ACTIVE_UPLOAD_ALREADY_EXISTS'
  | 'BULK_UPLOAD_ALREADY_ACTIVE'
  | 'BULK_UPLOAD_NOT_FOUND'
  | 'MISSING_ORGANIZATION'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

export class PublishingError extends Error {
  readonly code: PublishingErrorCode

  constructor(code: PublishingErrorCode, message: string) {
    super(message)
    this.name = 'PublishingError'
    this.code = code
  }
}
