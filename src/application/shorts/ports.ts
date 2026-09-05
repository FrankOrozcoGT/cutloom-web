import type { DetectResult, ImproveResult, ScoreResult, DetectedCandidate } from '@domain/shorts'
import type { SubtitleSegment } from '@domain/subtitles'
import type { Result } from '@application/result'
import type { ShortsError } from './errors'

export interface AudioClip {
  startMs: number
  endMs: number
  audioB64: string
}

export interface ShortsBackendPort {
  improveSubtitles(segments: SubtitleSegment[], userContext?: string): Promise<Result<ImproveResult, ShortsError>>
  detect(
    projectId: string,
    segments: SubtitleSegment[],
    ideal?: string,
  ): Promise<Result<DetectResult, ShortsError>>
  score(
    projectId: string,
    candidates: DetectedCandidate[],
    ideal: string | undefined,
    audioClips: AudioClip[],
  ): Promise<Result<ScoreResult, ShortsError>>
}
