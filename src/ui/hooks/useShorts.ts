import { useCallback, useState } from 'react'
import { detectSilenceCuts, type DetectedCandidate, type ImprovedSubtitle, type ShortScore, type SilenceCut } from '@domain/shorts'
import type { SubtitleSegment } from '@domain/subtitles'
import type { ShortsErrorCode } from '@application/shorts/errors'
import {
  detectShortsUseCase,
  extractSubtitlesAudioUseCase,
  improveSubtitlesUseCase,
  scoreShortsUseCase,
} from '@ui/shorts/composition'

export type ImproveSubtitlesState = 'idle' | 'loading' | 'success' | 'error'
export type CreateShortsState = 'idle' | 'extracting_audio' | 'detecting' | 'scoring' | 'success' | 'error'

const MIN_SILENCE_GAP_MS = 700

interface UseShortsResult {
  improveState: ImproveSubtitlesState
  improveError: ShortsErrorCode | null
  improvedSubtitles: ImprovedSubtitle[]
  improveSummary: string | null
  improveSubtitles: (projectId: string, segments: SubtitleSegment[], userContext?: string) => Promise<void>
  editImprovedSubtitle: (index: number, corrected: string) => void
  removeImprovedSubtitle: (index: number) => void

  createShortsState: CreateShortsState
  createShortsError: ShortsErrorCode | null
  candidates: DetectedCandidate[]
  shorts: ShortScore[]
  warnings: string[]
  createShorts: (projectId: string, segments: SubtitleSegment[], ideal?: string) => Promise<void>

  silenceCuts: SilenceCut[]
  detectSilence: (segments: SubtitleSegment[], minGapMs?: number) => void
  removeSilenceCut: (index: number) => void
}

export function useShorts(): UseShortsResult {
  const [improveState, setImproveState] = useState<ImproveSubtitlesState>('idle')
  const [improveError, setImproveError] = useState<ShortsErrorCode | null>(null)
  const [improvedSubtitles, setImprovedSubtitles] = useState<ImprovedSubtitle[]>([])
  const [improveSummary, setImproveSummary] = useState<string | null>(null)

  const [createShortsState, setCreateShortsState] = useState<CreateShortsState>('idle')
  const [createShortsError, setCreateShortsError] = useState<ShortsErrorCode | null>(null)
  const [candidates, setCandidates] = useState<DetectedCandidate[]>([])
  const [shorts, setShorts] = useState<ShortScore[]>([])
  const [warnings, setWarnings] = useState<string[]>([])

  const [silenceCuts, setSilenceCuts] = useState<SilenceCut[]>([])

  const improveSubtitles = useCallback(async (projectId: string, segments: SubtitleSegment[], userContext?: string) => {
    setImproveState('loading')
    setImproveError(null)
    const result = await improveSubtitlesUseCase.execute(projectId, segments, userContext)
    if (!result.ok) {
      setImproveError(result.error.code)
      setImproveState('error')
      return
    }
    setImprovedSubtitles(result.value.correctedSubtitles)
    setImproveSummary(result.value.summary)
    setImproveState('success')
  }, [])

  const editImprovedSubtitle = useCallback((index: number, corrected: string) => {
    setImprovedSubtitles((previous) => previous.map((item, i) => (i === index ? { ...item, corrected } : item)))
  }, [])

  const removeImprovedSubtitle = useCallback((index: number) => {
    setImprovedSubtitles((previous) => previous.filter((_, i) => i !== index))
  }, [])

  const createShorts = useCallback(async (projectId: string, segments: SubtitleSegment[], ideal?: string) => {
    setCreateShortsState('detecting')
    setCreateShortsError(null)
    setCandidates([])
    setShorts([])
    setWarnings([])

    const detectResult = await detectShortsUseCase.execute(projectId, segments, ideal)
    if (!detectResult.ok) {
      setCreateShortsError(detectResult.error.code)
      setCreateShortsState('error')
      return
    }
    setCandidates(detectResult.value.candidates)

    setCreateShortsState('extracting_audio')
    const audioResult = await extractSubtitlesAudioUseCase.execute(projectId)
    if (!audioResult.ok) {
      setCreateShortsError('UNKNOWN_ERROR')
      setCreateShortsState('error')
      return
    }

    setCreateShortsState('scoring')
    const scoreResult = await scoreShortsUseCase.execute(projectId, audioResult.value, detectResult.value.candidates, ideal)
    if (!scoreResult.ok) {
      setCreateShortsError(scoreResult.error.code)
      setCreateShortsState('error')
      return
    }

    const sortedShorts = [...scoreResult.value.shorts].sort((a, b) => b.score - a.score)
    setShorts(sortedShorts)
    setWarnings(scoreResult.value.warnings)
    setCreateShortsState('success')
  }, [])

  const detectSilence = useCallback((segments: SubtitleSegment[], minGapMs: number = MIN_SILENCE_GAP_MS) => {
    setSilenceCuts(detectSilenceCuts(segments, minGapMs))
  }, [])

  const removeSilenceCut = useCallback((index: number) => {
    setSilenceCuts((previous) => previous.filter((_, i) => i !== index))
  }, [])

  return {
    improveState,
    improveError,
    improvedSubtitles,
    improveSummary,
    improveSubtitles,
    editImprovedSubtitle,
    removeImprovedSubtitle,

    createShortsState,
    createShortsError,
    candidates,
    shorts,
    warnings,
    createShorts,

    silenceCuts,
    detectSilence,
    removeSilenceCut,
  }
}
