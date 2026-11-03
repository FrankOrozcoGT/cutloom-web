import { buildProjectShorts, type ShortScore } from '@domain/shorts'
import { err, type Result } from '@application/result'
import { EnsureRenderUseCase, type GenerateRenderError } from '@application/render/GenerateRenderUseCase'
import type { TimelineStorage } from '@application/timeline/ports'
import type { VideoStorage } from '@application/video/ports'
import type { ShortsStoragePort, ShortsStorageError } from './ports'

export type SaveShortsResultError = ShortsStorageError | GenerateRenderError | 'EMPTY_TIMELINE'

/**
 * Persiste el resultado de un score de shorts recién generado, recortado
 * siempre contra el render vigente del proyecto — si todavía no existe
 * ninguno (el usuario generó shorts antes de generar subtítulos), lo
 * dispara acá para poder trabajar el short sobre él.
 */
export class SaveShortsResultUseCase {
  private readonly shortsStorage: ShortsStoragePort
  private readonly timelineStorage: TimelineStorage
  private readonly videoStorage: VideoStorage
  private readonly ensureRenderUseCase: EnsureRenderUseCase

  constructor(
    shortsStorage: ShortsStoragePort,
    timelineStorage: TimelineStorage,
    videoStorage: VideoStorage,
    ensureRenderUseCase: EnsureRenderUseCase,
  ) {
    this.shortsStorage = shortsStorage
    this.timelineStorage = timelineStorage
    this.videoStorage = videoStorage
    this.ensureRenderUseCase = ensureRenderUseCase
  }

  async execute(projectId: string, shorts: ShortScore[], warnings: string[]): Promise<Result<void, SaveShortsResultError>> {
    const timelineResult = await this.timelineStorage.getByProject(projectId)
    if (!timelineResult.ok || !timelineResult.value) {
      return err('EMPTY_TIMELINE')
    }
    const timeline = timelineResult.value

    const assets = await this.videoStorage.getByProject(projectId)
    const assetsById = Object.fromEntries(assets.map((asset) => [asset.id, asset]))

    const renderResult = await this.ensureRenderUseCase.execute(timeline, assetsById)
    if (!renderResult.ok) {
      return err(renderResult.error)
    }

    const record = buildProjectShorts({
      projectId,
      renderId: renderResult.value.id,
      shorts,
      warnings,
    })
    return this.shortsStorage.save(record)
  }
}
