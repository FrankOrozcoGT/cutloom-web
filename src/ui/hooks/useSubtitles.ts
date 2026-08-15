import { useCallback, useEffect, useRef, useState } from 'react'
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
import type { ExtractSubtitlesAudioError } from '@application/subtitles/ExtractSubtitlesAudioUseCase'
import type { SubtitlesError } from '@application/subtitles/GenerateSubtitlesUseCase'
import type { SubtitlesWorkerRequest, SubtitlesWorkerResponse } from '@infrastructure/subtitles/subtitles.worker'
import { extractSubtitlesAudioUseCase, subtitlesStorage } from '@ui/subtitles/composition'

export type SubtitlesState = 'idle' | 'extracting_audio' | 'transcribing' | 'success' | 'error'

interface UseSubtitlesResult {
  state: SubtitlesState
  subtitles: Subtitles | null
  error: SubtitlesError | ExtractSubtitlesAudioError | SubtitleParseError | null
  language: LanguageCode
  setLanguage: (language: LanguageCode) => void
  /** Extremo (ms, tiempo de timeline) del último segmento ya transcrito durante 'transcribing'; null si no hay progreso aún. */
  processedUntilMs: number | null
  generate: () => Promise<void>
  editText: (segmentId: string, text: string) => Promise<void>
  editTiming: (segmentId: string, startMs: number, endMs: number) => Promise<void>
  importFile: (content: string, format: 'srt' | 'vtt') => Promise<void>
  /** Restaura un snapshot (o lo limpia con null) sin pasar por las validaciones de edición — usado por undo/redo del timeline. */
  restore: (subtitles: Subtitles | null) => Promise<void>
}

export function useSubtitles(projectId: string): UseSubtitlesResult {
  const [state, setState] = useState<SubtitlesState>('idle')
  const [subtitles, setSubtitles] = useState<Subtitles | null>(null)
  const [error, setError] = useState<SubtitlesError | ExtractSubtitlesAudioError | SubtitleParseError | null>(null)
  const [language, setLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE)
  const [processedUntilMs, setProcessedUntilMs] = useState<number | null>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

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

  const restore = useCallback(
    async (next: Subtitles | null) => {
      setSubtitles(next)
      setState(next ? 'success' : 'idle')
      if (next) {
        await subtitlesStorage.save(next)
      } else {
        await subtitlesStorage.deleteByProject(projectId)
      }
    },
    [projectId],
  )

  const generate = useCallback(async () => {
    setState('extracting_audio')
    setError(null)
    setProcessedUntilMs(null)

    // La extracción de audio depende de OfflineAudioContext (Web Audio API),
    // que no existe dentro de un Web Worker — corre acá en el hilo principal.
    // Solo la transcripción (Whisper, cómputo pesado) va al worker.
    const extractResult = await extractSubtitlesAudioUseCase.execute(projectId)
    if (!extractResult.ok) {
      setError(extractResult.error)
      setState('error')
      return
    }

    await new Promise<void>((resolve) => {
      const worker = new Worker(new URL('@infrastructure/subtitles/subtitles.worker.ts', import.meta.url), {
        type: 'module',
      })
      workerRef.current = worker

      worker.onmessage = (event: MessageEvent<SubtitlesWorkerResponse>) => {
        const message = event.data

        if (message.type === 'progress') {
          setState('transcribing')
          setProcessedUntilMs(Math.round(message.segment.end * 1000))
          return
        }

        if (message.type === 'error') {
          console.error('Generación de subtítulos falló:', message.error)
          setError(message.error as SubtitlesError)
          setState('error')
          setProcessedUntilMs(null)
          worker.terminate()
          workerRef.current = null
          resolve()
          return
        }

        void persist(message.result.subtitles).then(() => {
          setState('success')
          setProcessedUntilMs(null)
          worker.terminate()
          workerRef.current = null
          resolve()
        })
      }

      worker.onerror = (event) => {
        console.error('Worker de subtítulos falló:', event.message)
        setError('UNKNOWN_ERROR')
        setState('error')
        setProcessedUntilMs(null)
        worker.terminate()
        workerRef.current = null
        resolve()
      }

      const audio = extractResult.value
      const request: SubtitlesWorkerRequest = { type: 'generate', projectId, language, audio }
      worker.postMessage(request, [audio.buffer])
    })
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
    restore,
  }
}
