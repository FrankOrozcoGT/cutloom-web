import { GenerateSubtitlesUseCase, type SubtitlesError, type SubtitlesResult } from '@application/subtitles/GenerateSubtitlesUseCase'
import type { WhisperRawSegment } from '@application/subtitles/ports'
import type { LanguageCode } from '@domain/subtitles'
import { IndexedDBTimelineAdapter } from '@infrastructure/storage/IndexedDBTimelineAdapter'
import { IndexedDBAdapter } from '@infrastructure/storage/IndexedDBAdapter'
import { describeError } from '@infrastructure/errors'
import { AudioExtractionAdapter } from '@infrastructure/video/AudioExtractionAdapter'
import { WhisperAdapter } from './WhisperAdapter'

// Whisper en WASM (sin WebGPU) es cómputo síncrono pesado: corriendo en el
// hilo principal bloquea a React y la página entera parece congelada, aunque
// el trabajo avance de fondo. Igual que export.worker.ts para el pipeline de
// exportación, todo el caso de uso corre acá dentro para dejar el hilo
// principal libre y poder reportar progreso real mientras tanto.

export type SubtitlesWorkerRequest = {
  type: 'generate'
  projectId: string
  language: LanguageCode
}

export type SubtitlesWorkerResponse =
  | { type: 'progress'; segment: WhisperRawSegment }
  | { type: 'done'; result: SubtitlesResult }
  | { type: 'error'; error: SubtitlesError | string }

function postError(error: SubtitlesError | string): void {
  console.error('subtitles.worker:', error)
  const response: SubtitlesWorkerResponse = { type: 'error', error }
  self.postMessage(response)
}

self.onerror = (event: string | Event) => {
  const message = typeof event === 'string' ? event : (event as ErrorEvent).message
  postError(`UNCAUGHT: ${message}`)
}

self.onunhandledrejection = (event) => {
  postError(`UNHANDLED_REJECTION: ${describeError(event.reason)}`)
}

let generateUseCase: GenerateSubtitlesUseCase | null = null

try {
  generateUseCase = new GenerateSubtitlesUseCase(
    new IndexedDBTimelineAdapter(),
    new IndexedDBAdapter(),
    new AudioExtractionAdapter(),
    new WhisperAdapter(),
  )
} catch (e) {
  console.error('subtitles.worker: fallo al inicializar el pipeline de subtítulos', describeError(e))
}

self.onmessage = async (event: MessageEvent<SubtitlesWorkerRequest>) => {
  const message = event.data

  if (!generateUseCase) {
    postError('INIT_FAILED: el pipeline de subtítulos no se pudo inicializar en este navegador')
    return
  }

  try {
    const result = await generateUseCase.execute(message.projectId, message.language, (segment) => {
      const response: SubtitlesWorkerResponse = { type: 'progress', segment }
      self.postMessage(response)
    })

    const response: SubtitlesWorkerResponse = result.ok
      ? { type: 'done', result: result.value }
      : { type: 'error', error: result.error }
    self.postMessage(response)
  } catch (e) {
    postError(`UNCAUGHT: ${describeError(e)}`)
  }
}
