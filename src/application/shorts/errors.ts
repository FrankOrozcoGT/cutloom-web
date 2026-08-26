export type ShortsErrorCode =
  | 'MISSING_ORGANIZATION'
  | 'EMPTY_SEGMENTS'
  | 'EMPTY_CANDIDATES'
  | 'TOO_MANY_CLIPS'
  | 'INVALID_AUDIO_SEGMENT'
  | 'SHORTS_ACCESS_DENIED'
  | 'SHORTS_LLM_FAILED'
  | 'SUBTITLES_LLM_FAILED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

export class ShortsError extends Error {
  readonly code: ShortsErrorCode

  constructor(code: ShortsErrorCode, message: string) {
    super(message)
    this.name = 'ShortsError'
    this.code = code
  }
}
