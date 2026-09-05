import type { DetectedCandidate, DetectResult, ImprovedSubtitle, ImproveResult, ScoreResult, ShortScore } from '@domain/shorts'
import type { ShortsErrorCode } from '@application/shorts/errors'
import { ShortsError } from '@application/shorts/errors'
import { mapKnownError } from '@infrastructure/errors'

/** Wire format real de POST /api/shorts/detect (respuesta) y de POST /api/shorts/score (candidates del request) — start/end en segundos, no ms. id se reenvía a /score tal cual, sin recalcularlo. */
export interface DetectedCandidateDto {
  id: string
  start: number
  end: number
  confidence: number
  reason: string
}

export interface ImprovedSubtitleDto {
  start: number
  end: number
  original: string
  corrected: string
}

/** Wire format real de la respuesta de POST /api/shorts/score — start/end en segundos, no ms, igual que detect. */
export interface ShortScoreDto {
  start: number
  end: number
  confidence: number
  reason: string
  emotion: string | null
  score: number
}

export interface DetectResultDto {
  candidates: DetectedCandidateDto[]
}

export interface ScoreResultDto {
  shorts: ShortScoreDto[]
  warnings: string[]
}

export interface ImproveResultDto {
  summary: string
  correctedSubtitles: ImprovedSubtitleDto[]
}

export function mapDetectedCandidate(dto: DetectedCandidateDto): DetectedCandidate {
  return {
    id: dto.id,
    startMs: Math.round(dto.start * 1000),
    endMs: Math.round(dto.end * 1000),
    confidence: dto.confidence,
    reason: dto.reason,
  }
}

/** Inverso de mapDetectedCandidate — el dominio interno sigue en ms, pero score espera candidates en el mismo shape que devolvió detect (segundos), id incluido tal cual. */
export function toDetectedCandidateDto(candidate: DetectedCandidate): DetectedCandidateDto {
  return {
    id: candidate.id,
    start: candidate.startMs / 1000,
    end: candidate.endMs / 1000,
    confidence: candidate.confidence,
    reason: candidate.reason,
  }
}


export function mapDetectResult(dto: DetectResultDto): DetectResult {
  return { candidates: dto.candidates.map(mapDetectedCandidate) }
}

export function mapImprovedSubtitle(dto: ImprovedSubtitleDto): ImprovedSubtitle {
  return { startMs: dto.start, endMs: dto.end, original: dto.original, corrected: dto.corrected }
}

export function mapImproveResult(dto: ImproveResultDto): ImproveResult {
  return { summary: dto.summary, correctedSubtitles: dto.correctedSubtitles.map(mapImprovedSubtitle) }
}

export function mapShortScore(dto: ShortScoreDto): ShortScore {
  return {
    startMs: Math.round(dto.start * 1000),
    endMs: Math.round(dto.end * 1000),
    confidence: dto.confidence,
    reason: dto.reason,
    emotion: dto.emotion,
    score: dto.score,
  }
}

export function mapScoreResult(dto: ScoreResultDto): ScoreResult {
  return { shorts: dto.shorts.map(mapShortScore), warnings: dto.warnings }
}

const KNOWN_ERROR_CODES: readonly ShortsErrorCode[] = [
  'MISSING_ORGANIZATION',
  'EMPTY_SEGMENTS',
  'EMPTY_CANDIDATES',
  'TOO_MANY_CLIPS',
  'INVALID_AUDIO_SEGMENT',
  'INVALID_PAYLOAD',
  'PAYLOAD_TOO_LARGE',
  'SHORTS_ACCESS_DENIED',
  'SHORTS_LLM_FAILED',
  'SUBTITLES_LLM_FAILED',
  'NETWORK_ERROR',
  'UNKNOWN_ERROR',
]

export function mapShortsError(code: string, message?: string): ShortsError {
  return mapKnownError(KNOWN_ERROR_CODES, (c, m) => new ShortsError(c, m), code, message)
}
