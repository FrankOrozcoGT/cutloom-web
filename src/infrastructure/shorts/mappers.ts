import type { DetectedCandidate, DetectResult, ImprovedSubtitle, ImproveResult, ScoreResult, ShortScore } from '@domain/shorts'
import type { ShortsErrorCode } from '@application/shorts/errors'
import { ShortsError } from '@application/shorts/errors'

export interface DetectedCandidateDto {
  startMs: number
  endMs: number
  confidence: number
  reason: string
}

export interface ImprovedSubtitleDto {
  start: number
  end: number
  original: string
  corrected: string
}

export interface ShortScoreDto {
  startMs: number
  endMs: number
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
  return { startMs: dto.startMs, endMs: dto.endMs, confidence: dto.confidence, reason: dto.reason }
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
    startMs: dto.startMs,
    endMs: dto.endMs,
    confidence: dto.confidence,
    reason: dto.reason,
    emotion: dto.emotion,
    score: dto.score,
  }
}

export function mapScoreResult(dto: ScoreResultDto): ScoreResult {
  return { shorts: dto.shorts.map(mapShortScore), warnings: dto.warnings }
}

const KNOWN_ERROR_CODES = new Set<ShortsErrorCode>([
  'MISSING_ORGANIZATION',
  'EMPTY_SEGMENTS',
  'EMPTY_CANDIDATES',
  'TOO_MANY_CLIPS',
  'INVALID_AUDIO_SEGMENT',
  'SHORTS_ACCESS_DENIED',
  'SHORTS_LLM_FAILED',
  'SUBTITLES_LLM_FAILED',
  'NETWORK_ERROR',
  'UNKNOWN_ERROR',
])

export function mapShortsError(code: string, message?: string): ShortsError {
  const resolvedCode: ShortsErrorCode = KNOWN_ERROR_CODES.has(code as ShortsErrorCode)
    ? (code as ShortsErrorCode)
    : 'UNKNOWN_ERROR'
  return new ShortsError(resolvedCode, message ?? resolvedCode)
}
