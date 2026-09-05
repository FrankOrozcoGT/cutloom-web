import type { DetectResult, ShortIdeal } from '@domain/shorts'
import type { SubtitleSegment } from '@domain/subtitles'
import { err, type Result } from '@application/result'
import { ShortsError } from './errors'
import type { ShortsBackendPort } from './ports'

export class DetectShortsUseCase {
  private readonly backend: ShortsBackendPort

  constructor(backend: ShortsBackendPort) {
    this.backend = backend
  }

  async execute(segments: SubtitleSegment[], shortIdeal?: ShortIdeal): Promise<Result<DetectResult, ShortsError>> {
    if (segments.length === 0) {
      return err(new ShortsError('EMPTY_SEGMENTS', 'No hay subtítulos para detectar shorts.'))
    }
    return this.backend.detect(segments, shortIdeal)
  }
}
