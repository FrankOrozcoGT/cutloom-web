import { GenerateSubtitlesUseCase, type SubtitlesError, type SubtitlesResult } from '@application/subtitles/GenerateSubtitlesUseCase'
import type { WhisperRawSegment } from '@application/subtitles/ports'
import type { LanguageCode } from '@domain/subtitles'
import { describeError } from '@infrastructure/errors'
import { WhisperAdapter } from './WhisperAdapter'

// Whisper en WASM (sin WebGPU) es cómputo síncrono pesado: corriendo en el
// hilo principal bloquea a React y la página entera parece congelada, aunque
// el trabajo avance de fondo. Igual que export.worker.ts para el pipeline de
// exportación, la transcripción corre acá dentro para dejar el hilo principal
// libre y poder reportar progreso real mientras tanto.
//
// La extracción de audio NO corre acá: depende de OfflineAudioContext (Web
// Audio API), que no existe dentro de un Web Worker. El audio ya viene
// extraído (Float32Array, transferido sin copia) desde el hilo principal.

export type SubtitlesWorkerRequest = {
  type: 'generate'
  projectId: string
  language: LanguageCode
  audio: Float32Array
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

const generateUseCase = new GenerateSubtitlesUseCase(new WhisperAdapter())

self.onmessage = async (event: MessageEvent<SubtitlesWorkerRequest>) => {
  const message = event.data

  try {
    const result = await generateUseCase.execute(message.projectId, message.audio, message.language, (segment) => {
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
