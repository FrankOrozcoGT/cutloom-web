import { DEFAULT_LANGUAGE, type LanguageCode } from '@domain/subtitles'
import type { Render } from '@domain/render'
import { err, ok, type Result } from '@application/result'
import { GenerateRenderUseCase, type GenerateRenderError } from '@application/render/GenerateRenderUseCase'
import type { TimelineStorage } from '@application/timeline/ports'
import type { VideoStorage } from '@application/video/ports'
import type { SubtitlesStoragePort, WhisperProgressListener } from './ports'
import { GenerateSubtitlesUseCase, type SubtitlesError, type SubtitlesResult } from './GenerateSubtitlesUseCase'

export type GenerateSubtitlesAndRenderError = SubtitlesError | GenerateRenderError | 'STORAGE_ERROR'

/**
 * Transcribe el audio ya extraído y, siempre que la transcripción tenga
 * éxito, genera un render nuevo del timeline vigente con esos subtítulos
 * quemados — generar subtítulos es el punto del dominio que declara el
 * video terminado, así que siempre dispara un render nuevo, nunca reusa
 * uno anterior.
 */
export class GenerateSubtitlesAndRenderUseCase {
  private readonly generateSubtitlesUseCase: GenerateSubtitlesUseCase
  private readonly generateRenderUseCase: GenerateRenderUseCase
  private readonly timelineStorage: TimelineStorage
  private readonly videoStorage: VideoStorage
  private readonly subtitlesStorage: SubtitlesStoragePort

  constructor(
    generateSubtitlesUseCase: GenerateSubtitlesUseCase,
    generateRenderUseCase: GenerateRenderUseCase,
    timelineStorage: TimelineStorage,
    videoStorage: VideoStorage,
    subtitlesStorage: SubtitlesStoragePort,
  ) {
    this.generateSubtitlesUseCase = generateSubtitlesUseCase
    this.generateRenderUseCase = generateRenderUseCase
    this.timelineStorage = timelineStorage
    this.videoStorage = videoStorage
    this.subtitlesStorage = subtitlesStorage
  }

  async execute(
    projectId: string,
    audio: Float32Array,
    language: LanguageCode = DEFAULT_LANGUAGE,
    onProgress?: WhisperProgressListener,
  ): Promise<Result<{ subtitlesResult: SubtitlesResult; render: Render }, GenerateSubtitlesAndRenderError>> {
    const subtitlesResult = await this.generateSubtitlesUseCase.execute(projectId, audio, language, onProgress)
    if (!subtitlesResult.ok) {
      return err(subtitlesResult.error)
    }

    const saveSubtitlesResult = await this.subtitlesStorage.save(subtitlesResult.value.subtitles)
    if (!saveSubtitlesResult.ok) {
      return err('STORAGE_ERROR')
    }

    const timelineResult = await this.timelineStorage.getByProject(projectId)
    if (!timelineResult.ok || !timelineResult.value) {
      return err('EMPTY_TIMELINE')
    }
    const timeline = timelineResult.value

    const assets = await this.videoStorage.getByProject(projectId)
    const assetsById = Object.fromEntries(assets.map((asset) => [asset.id, asset]))

    const renderResult = await this.generateRenderUseCase.execute(
      timeline,
      assetsById,
      subtitlesResult.value.subtitles.segments,
    )
    if (!renderResult.ok) {
      return err(renderResult.error)
    }

    return ok({ subtitlesResult: subtitlesResult.value, render: renderResult.value })
  }
}
