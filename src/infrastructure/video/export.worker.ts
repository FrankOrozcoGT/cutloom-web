import { ExportProjectUseCase } from '@application/video/ExportProjectUseCase'
import type { ExportOptions, ExportProgressEvent } from '@application/video/exportTypes'
import { IndexedDBTimelineAdapter } from '@infrastructure/storage/IndexedDBTimelineAdapter'
import { IndexedDBAdapter } from '@infrastructure/storage/IndexedDBAdapter'
import { IndexedDBSubtitlesAdapter } from '@infrastructure/storage/IndexedDBSubtitlesAdapter'
import { describeError } from '@infrastructure/errors'
import { VideoDecoderAdapter } from './VideoDecoderAdapter'
import { VideoEncoderAdapter } from './VideoEncoderAdapter'
import { OffscreenCanvasCompositor } from './OffscreenCanvasCompositor'

export type ExportWorkerRequest = {
  type: 'export'
  projectId: string
  options: ExportOptions
  /** Acota la exportación a [startMs, endMs) del timeline — usado para exportar un short en vez del proyecto completo. */
  range?: { startMs: number; endMs: number }
  /** Offset horizontal de crop cuando el aspect ratio de origen no coincide con el destino (0-1, 0.5 = centrado). Solo aplica a exportaciones con range (shorts). */
  cropOffsetX?: number
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
    new IndexedDBSubtitlesAdapter(),
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
      message.range,
      message.cropOffsetX,
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
