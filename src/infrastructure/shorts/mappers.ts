import { z } from 'zod'
import type { DetectedCandidate, DetectResult, ImprovedSubtitle, ImproveResult, ScoreResult, ShortScore } from '@domain/shorts'
import type { ShortsErrorCode } from '@application/shorts/errors'
import { ShortsError } from '@application/shorts/errors'
import { mapKnownError } from '@infrastructure/errors'

/** Wire format real de POST /api/shorts/detect (respuesta) y de POST /api/shorts/score (candidates del request) — start/end en segundos, no ms. id se reenvía a /score tal cual, sin recalcularlo. */
const detectedCandidateSchema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  confidence: z.number(),
  reason: z.string(),
})
export type DetectedCandidateDto = z.infer<typeof detectedCandidateSchema>

const improvedSubtitleSchema = z.object({
  start: z.number(),
  end: z.number(),
  original: z.string(),
  corrected: z.string(),
})

/** Wire format real de la respuesta de POST /api/shorts/score — start/end en segundos, no ms, igual que detect. */
const shortScoreSchema = z.object({
  start: z.number(),
  end: z.number(),
  confidence: z.number(),
  reason: z.string(),
  emotion: z.string().nullable(),
  score: z.number(),
})

export const detectResultSchema = z.object({ candidates: z.array(detectedCandidateSchema) })
export type DetectResultDto = z.infer<typeof detectResultSchema>

export const scoreResultSchema = z.object({
  shorts: z.array(shortScoreSchema),
  warnings: z.array(z.string()),
})
export type ScoreResultDto = z.infer<typeof scoreResultSchema>

export const improveResultSchema = z.object({
  summary: z.string(),
  correctedSubtitles: z.array(improvedSubtitleSchema),
})
export type ImproveResultDto = z.infer<typeof improveResultSchema>

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

export function mapImprovedSubtitle(dto: z.infer<typeof improvedSubtitleSchema>): ImprovedSubtitle {
  return { startMs: dto.start, endMs: dto.end, original: dto.original, corrected: dto.corrected }
}

export function mapImproveResult(dto: ImproveResultDto): ImproveResult {
  return { summary: dto.summary, correctedSubtitles: dto.correctedSubtitles.map(mapImprovedSubtitle) }
}

export function mapShortScore(dto: z.infer<typeof shortScoreSchema>): ShortScore {
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
