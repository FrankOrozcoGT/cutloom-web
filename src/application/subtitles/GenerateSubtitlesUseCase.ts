import { DEFAULT_LANGUAGE, mapWhisperSegments, type LanguageCode, type Subtitles } from '@domain/subtitles'
import { err, ok, type Result } from '@application/result'
import type { TimelineStorage } from '@application/timeline/ports'
import { buildRenderSegments, loadTimelineAndAssets } from '@application/video/exportTypes'
import type { VideoStorage } from '@application/video/ports'
import type { AudioExtractorPort, WhisperProgressListener, WhisperTranscriberPort } from './ports'

export interface SubtitlesResult {
  subtitles: Subtitles
  /** Backend real usado para la transcripción (informativo: WASM es más lento que WebGPU). */
  device: 'webgpu' | 'wasm'
}

export type SubtitlesError =
  | 'EMPTY_TIMELINE'
  | 'MISSING_ASSET'
  | 'NO_SPEECH'
  | 'UNSUPPORTED_API'
  | 'INSUFFICIENT_HARDWARE'
  | 'UNKNOWN_ERROR'

/**
 * Piso mínimo para correr Whisper (whisper-tiny) en WASM sin trabarse: memoria
 * aproximada reportada por el navegador (navigator.deviceMemory, redondeada a
 * la potencia de 2 más cercana — no es exacta) y núcleos lógicos disponibles.
 * No aplica cuando el navegador no expone deviceMemory (Firefox/Safari): ahí
 * no hay forma de chequear, se deja pasar.
 */
const MIN_DEVICE_MEMORY_GB = 2
const MIN_HARDWARE_CONCURRENCY = 2

export class GenerateSubtitlesUseCase {
  private readonly timelineStorage: TimelineStorage
  private readonly videoStorage: VideoStorage
  private readonly audioExtractor: AudioExtractorPort
  private readonly transcriber: WhisperTranscriberPort

  constructor(
    timelineStorage: TimelineStorage,
    videoStorage: VideoStorage,
    audioExtractor: AudioExtractorPort,
    transcriber: WhisperTranscriberPort,
  ) {
    this.timelineStorage = timelineStorage
    this.videoStorage = videoStorage
    this.audioExtractor = audioExtractor
    this.transcriber = transcriber
  }

  async execute(
    projectId: string,
    language: LanguageCode = DEFAULT_LANGUAGE,
    onProgress?: WhisperProgressListener,
  ): Promise<Result<SubtitlesResult, SubtitlesError>> {
    if (!this.hasSufficientHardware()) {
      return err('INSUFFICIENT_HARDWARE')
    }

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

    const transcribeResult = await this.transcriber.transcribe(extractResult.value, { language }, onProgress)
    if (!transcribeResult.ok) {
      return err(this.mapWhisperError(transcribeResult.error))
    }

    const segments = mapWhisperSegments(transcribeResult.value.segments)

    if (segments.length === 0) {
      return err('NO_SPEECH')
    }

    const subtitles: Subtitles = { projectId, segments, language }

    return ok({ subtitles, device: transcribeResult.value.device })
  }

  private hasSufficientHardware(): boolean {
    const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number })

    const deviceMemory = nav?.deviceMemory
    if (deviceMemory !== undefined && deviceMemory < MIN_DEVICE_MEMORY_GB) {
      return false
    }

    const cores = nav?.hardwareConcurrency
    if (cores !== undefined && cores < MIN_HARDWARE_CONCURRENCY) {
      return false
    }

    return true
  }

  private mapAudioError(error: 'NO_AUDIO_TRACK' | 'UNSUPPORTED_API' | 'DECODE_FAILED'): SubtitlesError {
    if (error === 'NO_AUDIO_TRACK') return 'NO_SPEECH'
    if (error === 'UNSUPPORTED_API') return 'UNSUPPORTED_API'
    return 'UNKNOWN_ERROR'
  }

  private mapWhisperError(error: 'UNSUPPORTED_API' | 'MODEL_LOAD_FAILED' | 'TRANSCRIPTION_FAILED'): SubtitlesError {
    if (error === 'UNSUPPORTED_API') return 'UNSUPPORTED_API'
    return 'UNKNOWN_ERROR'
  }
}
