import { ExportProjectUseCase } from '@application/video/ExportProjectUseCase'
import type { ExportOptions, ExportProgressEvent } from '@application/video/exportTypes'
import { IndexedDBTimelineAdapter } from '@infrastructure/storage/IndexedDBTimelineAdapter'
import { IndexedDBAdapter } from '@infrastructure/storage/IndexedDBAdapter'
import { describeError } from '@infrastructure/errors'
import { VideoDecoderAdapter } from './VideoDecoderAdapter'
import { VideoEncoderAdapter } from './VideoEncoderAdapter'
import { OffscreenCanvasCompositor } from './OffscreenCanvasCompositor'

export type ExportWorkerRequest = {
  type: 'export'
  projectId: string
  options: ExportOptions
}

export type ExportWorkerAbort = {
  type: 'abort'
}

export type ExportWorkerMessage = ExportWorkerRequest | ExportWorkerAbort

export type ExportWorkerResponse =
  | { type: 'progress'; event: ExportProgressEvent }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; error: string }

function postError(message: string): void {
  console.error('export.worker:', message)
  const response: ExportWorkerResponse = { type: 'error', error: message }
  self.postMessage(response)
}

self.onerror = (event: string | Event) => {
  const message = typeof event === 'string' ? event : (event as ErrorEvent).message
  postError(`UNCAUGHT: ${message}`)
}

self.onunhandledrejection = (event) => {
  postError(`UNHANDLED_REJECTION: ${describeError(event.reason)}`)
}

let exportUseCase: ExportProjectUseCase | null = null

try {
  const compositor = new OffscreenCanvasCompositor()
  exportUseCase = new ExportProjectUseCase(
    new IndexedDBTimelineAdapter(),
    new IndexedDBAdapter(),
    new VideoDecoderAdapter(),
    new VideoEncoderAdapter(compositor),
    compositor,
  )
} catch (e) {
  console.error('export.worker: fallo al inicializar el pipeline de export', describeError(e))
}

let currentAbortController: AbortController | null = null

self.onmessage = async (event: MessageEvent<ExportWorkerMessage>) => {
  const message = event.data

  if (message.type === 'abort') {
    currentAbortController?.abort()
    return
  }

  if (!exportUseCase) {
    postError('INIT_FAILED: el pipeline de export no se pudo inicializar en este navegador')
    return
  }

  const abortController = new AbortController()
  currentAbortController = abortController

  try {
    const result = await exportUseCase.execute(
      message.projectId,
      message.options,
      (progressEvent) => {
        const response: ExportWorkerResponse = { type: 'progress', event: progressEvent }
        self.postMessage(response)
      },
      abortController.signal,
    )

    currentAbortController = null

    const response: ExportWorkerResponse = result.ok
      ? { type: 'done', blob: result.value }
      : { type: 'error', error: result.error }
    self.postMessage(response)
  } catch (e) {
    currentAbortController = null
    postError(`UNCAUGHT: ${describeError(e)}`)
  }
}
