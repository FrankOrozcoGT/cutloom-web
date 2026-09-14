export type PublishingErrorCode =
  | 'FEATURE_ACCESS_DENIED'
  | 'INVALID_PAYLOAD'
  | 'MISSING_TOPIC'
  | 'NO_YOUTUBE_CONNECTION'
  | 'TOO_MANY_VIDEOS'
  | 'VIDEO_FILE_TOO_LARGE'
  | 'METADATA_REVISION_NOT_FOUND'
  | 'METADATA_REVISION_SOURCE_MISMATCH'
  | 'SCHEDULE_CAPACITY_EXCEEDED'
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
