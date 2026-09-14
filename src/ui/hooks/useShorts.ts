import { useCallback, useState } from 'react'
import type { DetectedCandidate, ImprovedSubtitle, ProjectShorts, ShortIdeal, ShortScore } from '@domain/shorts'
import type { SubtitleSegment } from '@domain/subtitles'
import type { ShortsErrorCode } from '@application/shorts/errors'
import { detectShortsUseCase, extractSubtitlesAudioUseCase, scoreShortsUseCase, shortsApi } from '@ui/shorts/composition'

export type ImproveSubtitlesState = 'idle' | 'loading' | 'success' | 'error'
export type CreateShortsState = 'idle' | 'extracting_audio' | 'detecting' | 'scoring' | 'success' | 'error'

interface UseShortsResult {
  improveState: ImproveSubtitlesState
  improveError: ShortsErrorCode | null
  improvedSubtitles: ImprovedSubtitle[]
  improveSummary: string | null
  improveSubtitles: (segments: SubtitleSegment[], userContext?: string) => Promise<void>

  createShortsState: CreateShortsState
  createShortsError: ShortsErrorCode | null
  candidates: DetectedCandidate[]
  shorts: ShortScore[]
  warnings: string[]
  /** true si los shorts cargados fueron generados con una versión anterior del timeline (ver domain/timeline.timelineFingerprint) — sus tiempos ya no corresponden necesariamente al contenido actual. */
  isStale: boolean
  /** true solo tras un createShorts recién completado (no tras loadPersisted) — distingue "hay que persistir este resultado nuevo" de "esto ya viene de storage". */
  justCreated: boolean
  createShorts: (projectId: string, segments: SubtitleSegment[], shortIdeal?: ShortIdeal) => Promise<void>
  /** Precarga shorts ya guardados (IndexedDB) sin volver a llamar al backend — usado al entrar a la pantalla de shorts si el proyecto ya tiene un resultado previo. currentTimelineFingerprint se compara contra el guardado para marcar isStale. */
  loadPersisted: (persisted: ProjectShorts, currentTimelineFingerprint: string | null) => void
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
  const [isStale, setIsStale] = useState(false)
  const [justCreated, setJustCreated] = useState(false)

  const improveSubtitles = useCallback(async (segments: SubtitleSegment[], userContext?: string) => {
    setImproveState('loading')
    setImproveError(null)
    const result = await shortsApi.improveSubtitles(segments, userContext)
    if (!result.ok) {
      setImproveError(result.error.code)
      setImproveState('error')
      return
    }
    setImprovedSubtitles(result.value.correctedSubtitles)
    setImproveSummary(result.value.summary)
    setImproveState('success')
  }, [])

  const createShorts = useCallback(async (projectId: string, segments: SubtitleSegment[], shortIdeal?: ShortIdeal) => {
    setCreateShortsState('detecting')
    setCreateShortsError(null)
    setCandidates([])
    setShorts([])
    setWarnings([])
    setIsStale(false)
    setJustCreated(false)

    const detectResult = await detectShortsUseCase.execute(segments, shortIdeal)
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
    const scoreResult = await scoreShortsUseCase.execute(audioResult.value, detectResult.value.candidates, shortIdeal)
    if (!scoreResult.ok) {
      setCreateShortsError(scoreResult.error.code)
      setCreateShortsState('error')
      return
    }

    const sortedShorts = [...scoreResult.value.shorts].sort((a, b) => b.score - a.score)
    setShorts(sortedShorts)
    setWarnings(scoreResult.value.warnings)
    setJustCreated(true)
    setCreateShortsState('success')
  }, [])

  const loadPersisted = useCallback((persisted: ProjectShorts, currentTimelineFingerprint: string | null) => {
    setShorts(persisted.shorts)
    setWarnings(persisted.warnings)
    setIsStale(
      persisted.timelineFingerprint !== undefined && currentTimelineFingerprint !== persisted.timelineFingerprint,
    )
    setJustCreated(false)
    setCreateShortsState('success')
  }, [])

  return {
    improveState,
    improveError,
    improvedSubtitles,
    improveSummary,
    improveSubtitles,

    createShortsState,
    createShortsError,
    candidates,
    shorts,
    warnings,
    isStale,
    justCreated,
    createShorts,
    loadPersisted,
  }
}
