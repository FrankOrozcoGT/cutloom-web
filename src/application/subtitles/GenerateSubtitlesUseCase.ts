import { DEFAULT_LANGUAGE, mapWhisperSegments, type LanguageCode, type Subtitles } from '@domain/subtitles'
import { err, ok, type Result } from '@application/result'
import type { WhisperProgressListener, WhisperTranscriberPort } from './ports'

export interface SubtitlesResult {
  subtitles: Subtitles
  /** Backend real usado para la transcripción (informativo: WASM es más lento que WebGPU). */
  device: 'webgpu' | 'wasm'
}

export type SubtitlesError = 'NO_SPEECH' | 'UNSUPPORTED_API' | 'INSUFFICIENT_HARDWARE' | 'UNKNOWN_ERROR'

const SUBTITLES_ERROR_CODES: readonly SubtitlesError[] = [
  'NO_SPEECH',
  'UNSUPPORTED_API',
  'INSUFFICIENT_HARDWARE',
  'UNKNOWN_ERROR',
]

export function isSubtitlesError(value: string): value is SubtitlesError {
  return (SUBTITLES_ERROR_CODES as readonly string[]).includes(value)
}

/** Transcribe audio ya extraído (ver ExtractSubtitlesAudioUseCase) y lo mapea a segmentos de dominio. */
export class GenerateSubtitlesUseCase {
  private readonly transcriber: WhisperTranscriberPort

  constructor(transcriber: WhisperTranscriberPort) {
    this.transcriber = transcriber
  }

  async execute(
    projectId: string,
    audio: Float32Array,
    language: LanguageCode = DEFAULT_LANGUAGE,
    onProgress?: WhisperProgressListener,
  ): Promise<Result<SubtitlesResult, SubtitlesError>> {
    const transcribeResult = await this.transcriber.transcribe(audio, { language }, onProgress)
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

  private mapWhisperError(error: 'UNSUPPORTED_API' | 'INSUFFICIENT_HARDWARE' | 'MODEL_LOAD_FAILED' | 'TRANSCRIPTION_FAILED'): SubtitlesError {
    if (error === 'UNSUPPORTED_API') return 'UNSUPPORTED_API'
    if (error === 'INSUFFICIENT_HARDWARE') return 'INSUFFICIENT_HARDWARE'
    return 'UNKNOWN_ERROR'
  }
}
