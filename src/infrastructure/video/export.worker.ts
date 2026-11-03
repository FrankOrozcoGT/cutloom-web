import { EnsureRenderUseCase, GenerateRenderUseCase } from '@application/render/GenerateRenderUseCase'
import type { GenerateRenderError } from '@application/render/GenerateRenderUseCase'
import { ExtractShortUseCase, type ExtractShortError } from '@application/shorts/ExtractShortUseCase'
import { IndexedDBTimelineAdapter } from '@infrastructure/storage/IndexedDBTimelineAdapter'
import { IndexedDBAdapter } from '@infrastructure/storage/IndexedDBAdapter'
import { IndexedDBRenderAdapter } from '@infrastructure/storage/IndexedDBRenderAdapter'
import { describeError } from '@infrastructure/errors'
import { VideoDecoderAdapter } from './VideoDecoderAdapter'
import { VideoEncoderAdapter } from './VideoEncoderAdapter'
import { OffscreenCanvasCompositor } from './OffscreenCanvasCompositor'
import { RenderEngineAdapter } from './RenderEngineAdapter'
import { ShortExtractorAdapter } from '@infrastructure/shorts/ShortExtractorAdapter'

export type ExportWorkerRequest = {
  type: 'export'
  projectId: string
  /** Acota la exportación a [startMs, endMs) del render — presente para exportar un short, ausente para el video completo. */
  range?: { startMs: number; endMs: number }
  cropOffsetX?: number
}

export type ExportWorkerMessage = ExportWorkerRequest

export type ExportWorkerResponse =
  | { type: 'done'; blob: Blob }
  | { type: 'error'; error: GenerateRenderError | ExtractShortError | string }

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

const timelineStorage = new IndexedDBTimelineAdapter()
const videoStorage = new IndexedDBAdapter()
const renderStorage = new IndexedDBRenderAdapter()

const compositor = new OffscreenCanvasCompositor()
const renderEngine = new RenderEngineAdapter(new VideoDecoderAdapter(), new VideoEncoderAdapter(compositor), compositor)
const ensureRenderUseCase = new EnsureRenderUseCase(renderStorage, new GenerateRenderUseCase(renderEngine, renderStorage))
const extractShortUseCase = new ExtractShortUseCase(new ShortExtractorAdapter())

self.onmessage = async (event: MessageEvent<ExportWorkerMessage>) => {
  const message = event.data

  try {
    const timelineResult = await timelineStorage.getByProject(message.projectId)
    if (!timelineResult.ok || !timelineResult.value) {
      postError('EMPTY_TIMELINE')
      return
    }
    const timeline = timelineResult.value

    const assets = await videoStorage.getByProject(message.projectId)
    const assetsById = Object.fromEntries(assets.map((asset) => [asset.id, asset]))

    const renderResult = await ensureRenderUseCase.execute(timeline, assetsById)
    if (!renderResult.ok) {
      const response: ExportWorkerResponse = { type: 'error', error: renderResult.error }
      self.postMessage(response)
      return
    }

    if (!message.range) {
      const response: ExportWorkerResponse = { type: 'done', blob: renderResult.value.blob }
      self.postMessage(response)
      return
    }

    const shortResult = await extractShortUseCase.execute(
      renderResult.value,
      message.range.startMs,
      message.range.endMs,
      message.cropOffsetX ?? 0.5,
    )
    const response: ExportWorkerResponse = shortResult.ok
      ? { type: 'done', blob: shortResult.value }
      : { type: 'error', error: shortResult.error }
    self.postMessage(response)
  } catch (e) {
    postError(`UNCAUGHT: ${describeError(e)}`)
  }
}
