import type { ImproveResult } from '@domain/shorts'
import type { SubtitleSegment } from '@domain/subtitles'
import type { Result } from '@application/result'
import type { ShortsError } from './errors'
import type { ShortsBackendPort } from './ports'

export class ImproveSubtitlesUseCase {
  private readonly backend: ShortsBackendPort

  constructor(backend: ShortsBackendPort) {
    this.backend = backend
  }

  async execute(
    projectId: string,
    segments: SubtitleSegment[],
    userContext?: string,
  ): Promise<Result<ImproveResult, ShortsError>> {
    return this.backend.improveSubtitles(projectId, segments, userContext)
  }
}
