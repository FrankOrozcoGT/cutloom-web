import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_LANGUAGE,
  editSegmentText,
  editSegmentTiming,
  importSrt,
  importVtt,
  type LanguageCode,
  type SubtitleParseError,
  type Subtitles,
} from '@domain/subtitles'
import type { SubtitlesError } from '@application/subtitles/GenerateSubtitlesUseCase'
import { generateSubtitlesUseCase, subtitlesStorage } from '@ui/subtitles/composition'

export type SubtitlesState = 'idle' | 'extracting_audio' | 'transcribing' | 'success' | 'error'

interface UseSubtitlesResult {
  state: SubtitlesState
  subtitles: Subtitles | null
  error: SubtitlesError | SubtitleParseError | null
  language: LanguageCode
  setLanguage: (language: LanguageCode) => void
  /** Extremo (ms, tiempo de timeline) del último segmento ya transcrito durante 'transcribing'; null si no hay progreso aún. */
  processedUntilMs: number | null
  generate: () => Promise<void>
  editText: (segmentId: string, text: string) => Promise<void>
  editTiming: (segmentId: string, startMs: number, endMs: number) => Promise<void>
  importFile: (content: string, format: 'srt' | 'vtt') => Promise<void>
}

export function useSubtitles(projectId: string): UseSubtitlesResult {
  const [state, setState] = useState<SubtitlesState>('idle')
  const [subtitles, setSubtitles] = useState<Subtitles | null>(null)
  const [error, setError] = useState<SubtitlesError | SubtitleParseError | null>(null)
  const [language, setLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE)
  const [processedUntilMs, setProcessedUntilMs] = useState<number | null>(null)

  useEffect(() => {
    setSubtitles(null)
    setState('idle')
    setError(null)
    if (!projectId) return

    void subtitlesStorage.getByProject(projectId).then((result) => {
      if (!result.ok || !result.value) return
      setSubtitles(result.value)
      setLanguage(result.value.language)
      setState('success')
    })
  }, [projectId])

  const persist = useCallback(async (next: Subtitles) => {
    setSubtitles(next)
    await subtitlesStorage.save(next)
  }, [])

  const generate = useCallback(async () => {
    setState('extracting_audio')
    setError(null)
    setProcessedUntilMs(null)

    const result = await generateSubtitlesUseCase.execute(projectId, language, (rawSegment) => {
      setState('transcribing')
      setProcessedUntilMs(Math.round(rawSegment.end * 1000))
    })

    if (!result.ok) {
      setError(result.error)
      setState('error')
      return
    }
    await persist(result.value.subtitles)
    setState('success')
    setProcessedUntilMs(null)
  }, [projectId, language, persist])

  const editText = useCallback(
    async (segmentId: string, text: string) => {
      if (!subtitles) return
      const result = editSegmentText(subtitles.segments, segmentId, text)
      if (!result.ok) return
      await persist({ ...subtitles, segments: result.value })
    },
    [subtitles, persist],
  )

  const editTiming = useCallback(
    async (segmentId: string, startMs: number, endMs: number) => {
      if (!subtitles) return
      const result = editSegmentTiming(subtitles.segments, segmentId, startMs, endMs)
      if (!result.ok) return
      await persist({ ...subtitles, segments: result.value })
    },
    [subtitles, persist],
  )

  const importFile = useCallback(
    async (content: string, format: 'srt' | 'vtt') => {
      const result = format === 'srt' ? importSrt(content) : importVtt(content)
      if (!result.ok) {
        setError(result.error)
        setState('error')
        return
      }
      setError(null)
      const next: Subtitles = { projectId, segments: result.value, language }
      await persist(next)
      setState('success')
    },
    [projectId, language, persist],
  )

  return {
    state,
    subtitles,
    error,
    language,
    setLanguage,
    processedUntilMs,
    generate,
    editText,
    editTiming,
    importFile,
  }
}
