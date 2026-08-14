import type { ValidationError } from '@domain/video'
import { err, ok, type Result } from '@application/result'

const ALLOWED_FORMATS = ['video/mp4', 'video/webm']
const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024

export class VideoValidator {
  validate(file: File): Result<void, ValidationError> {
    if (!ALLOWED_FORMATS.includes(file.type)) {
      return err('UNSUPPORTED_FORMAT')
    }
    if (file.size > MAX_SIZE_BYTES) {
      return err('FILE_TOO_LARGE')
    }
    return ok(undefined)
  }
}
