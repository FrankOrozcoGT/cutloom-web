import { err, ok, type Result } from '@application/result'
import type { TimelineStorage } from '@application/timeline/ports'
import { buildRenderSegments, loadTimelineAndAssets } from '@application/video/exportTypes'
import type { VideoStorage } from '@application/video/ports'
import type { AudioExtractorPort } from './ports'

export type ExtractSubtitlesAudioError = 'EMPTY_TIMELINE' | 'MISSING_ASSET' | 'NO_SPEECH' | 'UNSUPPORTED_API' | 'UNKNOWN_ERROR'

/**
 * Extrae el audio del timeline compuesto, listo para transcribir. Separado de
 * GenerateSubtitlesUseCase porque depende de OfflineAudioContext (Web Audio
 * API), que no existe dentro de un Web Worker — tiene que correr en el hilo
 * principal, a diferencia de la transcripción con Whisper (que sí conviene
 * mover a un worker por ser cómputo pesado).
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

  async execute(projectId: string): Promise<Result<Float32Array, ExtractSubtitlesAudioError>> {
    const loadResult = await loadTimelineAndAssets(this.timelineStorage, this.videoStorage, projectId)
    if (!loadResult.ok) {
      return err(loadResult.error === 'STORAGE_ERROR' ? 'UNKNOWN_ERROR' : 'EMPTY_TIMELINE')
    }
    const { timeline, assetsById } = loadResult.value

    const segmentsResult = buildRenderSegments(timeline, assetsById)
    if (!segmentsResult.ok) {
      return err(segmentsResult.error)
    }

    const extractResult = await this.audioExtractor.extract(segmentsResult.value)
    if (!extractResult.ok) {
      return err(this.mapAudioError(extractResult.error))
    }

    return ok(extractResult.value)
  }

  private mapAudioError(error: 'NO_AUDIO_TRACK' | 'UNSUPPORTED_API' | 'DECODE_FAILED'): ExtractSubtitlesAudioError {
    if (error === 'NO_AUDIO_TRACK') return 'NO_SPEECH'
    if (error === 'UNSUPPORTED_API') return 'UNSUPPORTED_API'
    return 'UNKNOWN_ERROR'
  }
}
