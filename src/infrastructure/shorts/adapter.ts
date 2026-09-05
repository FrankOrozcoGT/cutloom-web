import type { DetectedCandidate, DetectResult, ImproveResult, ScoreResult } from '@domain/shorts'
import type { SubtitleSegment } from '@domain/subtitles'
import type { AudioClip, ShortsBackendPort } from '@application/shorts/ports'
import { ShortsError } from '@application/shorts/errors'
import { err, ok, type Result } from '@application/result'
import type { HttpClient } from '@infrastructure/http/client'
import {
  mapDetectResult,
  mapImproveResult,
  mapScoreResult,
  mapShortsError,
  type DetectResultDto,
  type ImproveResultDto,
  type ScoreResultDto,
} from './mappers'

export class ShortsApiAdapter implements ShortsBackendPort {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async improveSubtitles(segments: SubtitleSegment[], userContext?: string): Promise<Result<ImproveResult, ShortsError>> {
    const response = await this.http.post('/api/shorts/improve-subtitles', {
      segments: segments.map((segment) => ({ start: segment.startMs, end: segment.endMs, text: segment.text })),
      userContext,
    })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as ImproveResultDto
    return ok(mapImproveResult(body))
  }

  async detect(
    projectId: string,
    segments: SubtitleSegment[],
    ideal?: string,
  ): Promise<Result<DetectResult, ShortsError>> {
    const response = await this.http.post('/api/shorts/detect', { projectId, segments, ideal })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as DetectResultDto
    return ok(mapDetectResult(body))
  }

  async score(
    projectId: string,
    candidates: DetectedCandidate[],
    ideal: string | undefined,
    audioClips: AudioClip[],
  ): Promise<Result<ScoreResult, ShortsError>> {
    const response = await this.http.post('/api/shorts/score', { projectId, candidates, ideal, audioClips })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as ScoreResultDto
    return ok(mapScoreResult(body))
  }

  private async parseError(response: Response): Promise<ShortsError> {
    try {
      const body = (await response.json()) as { error?: string; message?: string }
      return mapShortsError(body.error ?? 'UNKNOWN_ERROR', body.message)
    } catch {
      return mapShortsError('UNKNOWN_ERROR')
    }
  }
}
