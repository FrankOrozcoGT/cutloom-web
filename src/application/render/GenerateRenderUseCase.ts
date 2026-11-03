import { timelineFingerprint, type Timeline } from '@domain/timeline'
import type { Render } from '@domain/render'
import type { SubtitleSegment } from '@domain/subtitles'
import type { VideoAsset } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import { buildRenderSegments, type BuildRenderSegmentsError } from './buildRenderSegments'
import type { RenderEngineError, RenderEnginePort, RenderOptions, RenderProgressListener, RenderStorage } from './ports'

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  fps: 30,
  width: 1280,
  height: 720,
}

export type GenerateRenderError = BuildRenderSegmentsError | RenderEngineError | 'STORAGE_ERROR'

function nextRenderId(): string {
  return `render-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Siempre genera un render nuevo a partir del timeline vigente, sobre los
 * VideoAsset originales — nunca reusa uno existente. Es el único punto de
 * la arquitectura donde se decodifica/codifica el original completo.
 */
export class GenerateRenderUseCase {
  private readonly renderEngine: RenderEnginePort
  private readonly renderStorage: RenderStorage

  constructor(renderEngine: RenderEnginePort, renderStorage: RenderStorage) {
    this.renderEngine = renderEngine
    this.renderStorage = renderStorage
  }

  async execute(
    timeline: Timeline,
    assetsById: Record<string, VideoAsset>,
    subtitleSegments: SubtitleSegment[] = [],
    onProgress?: RenderProgressListener,
  ): Promise<Result<Render, GenerateRenderError>> {
    const segmentsResult = buildRenderSegments(timeline, assetsById)
    if (!segmentsResult.ok) {
      return err(segmentsResult.error)
    }

    const renderResult = await this.renderEngine.render(segmentsResult.value, DEFAULT_RENDER_OPTIONS, subtitleSegments, onProgress)
    if (!renderResult.ok) {
      return err(renderResult.error)
    }

    const render: Render = {
      id: nextRenderId(),
      projectId: timeline.projectId,
      blob: renderResult.value,
      timelineFingerprint: timelineFingerprint(timeline),
      createdAt: Date.now(),
    }

    const saveResult = await this.renderStorage.save(render)
    if (!saveResult.ok) {
      return err('STORAGE_ERROR')
    }

    return ok(render)
  }
}

/** Devuelve el render vigente del proyecto, generando uno nuevo si todavía no existe ninguno — usado por shorts, nunca por subtítulos (que siempre regenera). */
export class EnsureRenderUseCase {
  private readonly renderStorage: RenderStorage
  private readonly generateRenderUseCase: GenerateRenderUseCase

  constructor(renderStorage: RenderStorage, generateRenderUseCase: GenerateRenderUseCase) {
    this.renderStorage = renderStorage
    this.generateRenderUseCase = generateRenderUseCase
  }

  async execute(
    timeline: Timeline,
    assetsById: Record<string, VideoAsset>,
  ): Promise<Result<Render, GenerateRenderError>> {
    const existingResult = await this.renderStorage.getByProject(timeline.projectId)
    if (existingResult.ok && existingResult.value) {
      return ok(existingResult.value)
    }
    return this.generateRenderUseCase.execute(timeline, assetsById)
  }
}
