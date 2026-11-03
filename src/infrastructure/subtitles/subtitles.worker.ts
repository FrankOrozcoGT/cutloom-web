import { GenerateSubtitlesUseCase, type SubtitlesResult } from '@application/subtitles/GenerateSubtitlesUseCase'
import { GenerateSubtitlesAndRenderUseCase, type GenerateSubtitlesAndRenderError } from '@application/subtitles/GenerateSubtitlesAndRenderUseCase'
import { GenerateRenderUseCase } from '@application/render/GenerateRenderUseCase'
import type { WhisperRawSegment } from '@application/subtitles/ports'
import type { Render } from '@domain/render'
import type { LanguageCode } from '@domain/subtitles'
import { describeError } from '@infrastructure/errors'
import { IndexedDBTimelineAdapter } from '@infrastructure/storage/IndexedDBTimelineAdapter'
import { IndexedDBAdapter } from '@infrastructure/storage/IndexedDBAdapter'
import { IndexedDBSubtitlesAdapter } from '@infrastructure/storage/IndexedDBSubtitlesAdapter'
import { IndexedDBRenderAdapter } from '@infrastructure/storage/IndexedDBRenderAdapter'
import { WhisperAdapter } from './WhisperAdapter'
import { createRenderEngine } from '@infrastructure/video/createRenderEngine'

// Whisper en WASM (sin WebGPU) y el pipeline de render (decode/encode con
// WebCodecs) son cómputo síncrono pesado: corriendo en el hilo principal
// bloquean a React y la página entera parece congelada, aunque el trabajo
// avance de fondo. Ambos pasos corren acá, uno después del otro, porque el
// render siempre se dispara junto con la generación de subtítulos (ver
// GenerateSubtitlesAndRenderUseCase).
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
  | { type: 'done'; result: { subtitlesResult: SubtitlesResult; render: Render } }
  | { type: 'error'; error: GenerateSubtitlesAndRenderError | string }

function postError(error: GenerateSubtitlesAndRenderError | string): void {
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

const timelineStorage = new IndexedDBTimelineAdapter()
const videoStorage = new IndexedDBAdapter()
const subtitlesStorage = new IndexedDBSubtitlesAdapter()
const renderStorage = new IndexedDBRenderAdapter()

const generateUseCase = new GenerateSubtitlesAndRenderUseCase(
  new GenerateSubtitlesUseCase(new WhisperAdapter()),
  new GenerateRenderUseCase(createRenderEngine(), renderStorage),
  timelineStorage,
  videoStorage,
  subtitlesStorage,
)

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
