import type { DetectedCandidate, DetectResult, ImproveResult, ScoreResult, ShortIdeal } from '@domain/shorts'
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
  toDetectedCandidateDto,
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

  async detect(segments: SubtitleSegment[], shortIdeal?: ShortIdeal): Promise<Result<DetectResult, ShortsError>> {
    const response = await this.http.post('/api/shorts/detect', {
      segments: segments.map((segment) => ({ start: segment.startMs / 1000, end: segment.endMs / 1000, text: segment.text })),
      shortIdealJson: shortIdeal,
    })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as DetectResultDto
    return ok(mapDetectResult(body))
  }

  async score(
    candidates: DetectedCandidate[],
    audioClips: AudioClip[],
    shortIdeal?: ShortIdeal,
  ): Promise<Result<ScoreResult, ShortsError>> {
    const candidateDtos = candidates.map(toDetectedCandidateDto)
    const formData = new FormData()
    formData.append('payload', JSON.stringify({ candidates: candidateDtos, shortIdealJson: shortIdeal }))
    // El fieldname es audio_<candidateId> — la relación se resuelve por el id
    // estable de /detect, no por posición en el array, así que candidates
    // puede reordenarse/filtrarse sin desalinear qué audio pertenece a cuál.
    for (const clip of audioClips) {
      const fieldName = `audio_${clip.candidateId}`
      formData.append(fieldName, clip.audioBlob, `${fieldName}.wav`)
    }

    const response = await this.http.postForm('/api/shorts/score', formData)
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as ScoreResultDto
    return ok(mapScoreResult(body))
  }

  private async parseError(response: Response): Promise<ShortsError> {
    if (response.status === 413) {
      return mapShortsError('PAYLOAD_TOO_LARGE', 'El contenido enviado es demasiado grande para procesarlo.')
    }
    try {
      const body = (await response.json()) as { error?: string; message?: string }
      return mapShortsError(body.error ?? 'UNKNOWN_ERROR', body.message)
    } catch {
      return mapShortsError('UNKNOWN_ERROR')
    }
  }
}
