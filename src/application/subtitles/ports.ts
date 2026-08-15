import type { LanguageCode, Subtitles } from '@domain/subtitles'
import type { Result } from '@application/result'
import type { RenderSegment } from '@application/video/exportTypes'

export type AudioExtractError = 'NO_AUDIO_TRACK' | 'UNSUPPORTED_API' | 'DECODE_FAILED'

export interface AudioExtractorPort {
  /**
   * Decodifica y concatena el audio de cada segmento del timeline compuesto (en
   * su orden de salida, con los huecos rellenados de silencio), y lo devuelve
   * como mono 16kHz — así los timestamps de Whisper ya quedan en tiempo de
   * timeline, sin necesitar remapeo por clip.
   */
  extract(segments: RenderSegment[]): Promise<Result<Float32Array, AudioExtractError>>
}

export interface WhisperRawSegment {
  text: string
  start: number
  end: number
}

export interface WhisperOutput {
  segments: WhisperRawSegment[]
  /** Backend real usado para la inferencia. 'wasm' es más lento; sirve para avisarle al usuario. */
  device: 'webgpu' | 'wasm'
}

export interface WhisperTranscribeOptions {
  /** Idioma fijado por el usuario. Whisper no expone detección automática con score en transformers.js. */
  language: LanguageCode
}

/** Progreso incremental de la transcripción: un segmento recién cerrado, listo para mostrarse. */
export type WhisperProgressListener = (segment: WhisperRawSegment) => void

export type WhisperError = 'UNSUPPORTED_API' | 'MODEL_LOAD_FAILED' | 'TRANSCRIPTION_FAILED'

export interface WhisperTranscriberPort {
  transcribe(
    audio: Float32Array,
    options: WhisperTranscribeOptions,
    onProgress?: WhisperProgressListener,
  ): Promise<Result<WhisperOutput, WhisperError>>
}

export type SubtitlesStorageError = 'STORAGE_ERROR' | 'CORRUPTED_DATA'

export interface SubtitlesStoragePort {
  save(subtitles: Subtitles): Promise<Result<void, SubtitlesStorageError>>
  getByProject(projectId: string): Promise<Result<Subtitles | null, SubtitlesStorageError>>
  deleteByProject(projectId: string): Promise<Result<void, SubtitlesStorageError>>
}
