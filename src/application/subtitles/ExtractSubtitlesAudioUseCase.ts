import { err, ok, type Result } from '@application/result'
import { buildRenderSegments, type BuildRenderSegmentsError } from '@application/render/buildRenderSegments'
import type { TimelineStorage } from '@application/timeline/ports'
import type { StorageError, VideoStorage } from '@application/video/ports'
import type { AudioExtractError, AudioExtractorPort, AudioExtractProgressListener } from './ports'

export type ExtractAudioError = BuildRenderSegmentsError | AudioExtractError | StorageError | 'UNKNOWN_ERROR' | 'EMPTY_TIMELINE'

/**
 * Extrae el audio del timeline vigente (sin generar todavía el render con
 * subtítulos quemados — eso recién ocurre en GenerateRenderUseCase, una vez
 * que la transcripción ya existe) para transcribir con Whisper. Comparte
 * segmentos con el render final, así los timestamps de Whisper quedan en
 * tiempo de timeline sin remapeo por clip.
 */
export class ExtractSubtitlesAudioUseCase {
  private readonly timelineStorage: TimelineStorage
  private readonly videoStorage: VideoStorage
  private readonly audioExtractor: AudioExtractorPort

  constructor(timelineStorage: TimelineStorage, videoStorage: VideoStorage, audioExtractor: AudioExtractorPort) {
    this.timelineStorage = timelineStorage
    this.videoStorage = videoStorage
    this.audioExtractor = audioExtractor
  }

  async execute(
    projectId: string,
    onProgress?: AudioExtractProgressListener,
  ): Promise<Result<Float32Array, ExtractAudioError>> {
    const timelineResult = await this.timelineStorage.getByProject(projectId)
    if (!timelineResult.ok || !timelineResult.value) {
      return err('EMPTY_TIMELINE')
    }
    const timeline = timelineResult.value

    const assetsResult = await this.videoStorage.getByProject(projectId)
    if (!assetsResult.ok) {
      return err(assetsResult.error)
    }
    const assetsById = Object.fromEntries(assetsResult.value.map((asset) => [asset.id, asset]))

    const segmentsResult = buildRenderSegments(timeline, assetsById)
    if (!segmentsResult.ok) {
      return err(segmentsResult.error)
    }

    const extractResult = await this.audioExtractor.extract(segmentsResult.value, onProgress)
    if (!extractResult.ok) {
      return err(extractResult.error)
    }

    return ok(extractResult.value)
  }
}
