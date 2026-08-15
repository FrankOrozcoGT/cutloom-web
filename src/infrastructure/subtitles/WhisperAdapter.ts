import {
  pipeline,
  WhisperTextStreamer,
  type AutomaticSpeechRecognitionOutput,
  type AutomaticSpeechRecognitionPipeline,
} from '@huggingface/transformers'
import type { LanguageCode } from '@domain/subtitles'
import { err, ok, type Result } from '@application/result'
import type {
  WhisperError,
  WhisperOutput,
  WhisperProgressListener,
  WhisperTranscribeOptions,
  WhisperTranscriberPort,
} from '@application/subtitles/ports'
import { describeError } from '@infrastructure/errors'

const MODEL_ID = 'onnx-community/whisper-tiny'
const CHUNK_LENGTH_SECONDS = 30
const STRIDE_LENGTH_SECONDS = 5
// Cada ventana de audio de chunk_length_s se transcribe con una llamada de
// generate() separada; el streamer reporta tiempos relativos al inicio de esa
// ventana, no al audio completo. avanza al mismo paso que usa el pipeline
// internamente (chunk_length_s - 2*stride_length_s) para reconstruir el offset
// absoluto de cada ventana.
const WINDOW_ADVANCE_SECONDS = CHUNK_LENGTH_SECONDS - 2 * STRIDE_LENGTH_SECONDS

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  es: 'spanish',
  en: 'english',
}

async function hasWebGpu(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.gpu) return false
  try {
    const adapter = await navigator.gpu.requestAdapter()
    return adapter !== null
  } catch {
    return false
  }
}

/** Transcribe audio localmente con Whisper (transformers.js), 100% en el navegador. */
export class WhisperAdapter implements WhisperTranscriberPort {
  private transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null
  private device: 'webgpu' | 'wasm' = 'wasm'

  async transcribe(
    audio: Float32Array,
    options: WhisperTranscribeOptions,
    onProgress?: WhisperProgressListener,
  ): Promise<Result<WhisperOutput, WhisperError>> {
    if (typeof WebAssembly === 'undefined') {
      return err('UNSUPPORTED_API')
    }

    let transcriber: AutomaticSpeechRecognitionPipeline
    try {
      transcriber = await this.loadTranscriber()
    } catch (e) {
      console.error('WhisperAdapter: fallo al cargar el modelo', describeError(e))
      return err('MODEL_LOAD_FAILED')
    }

    try {
      const streamer = onProgress ? this.createStreamer(transcriber, onProgress) : undefined

      const output = await transcriber(audio, {
        language: LANGUAGE_NAMES[options.language],
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: CHUNK_LENGTH_SECONDS,
        stride_length_s: STRIDE_LENGTH_SECONDS,
        streamer,
      })

      const result: AutomaticSpeechRecognitionOutput = Array.isArray(output) ? output[0] : output
      const segments = (result.chunks ?? []).map((chunk) => ({
        text: chunk.text,
        start: chunk.timestamp[0],
        end: chunk.timestamp[1],
      }))

      return ok({ segments, device: this.device })
    } catch (e) {
      console.error('WhisperAdapter: fallo al transcribir', describeError(e))
      return err('TRANSCRIPTION_FAILED')
    }
  }

  /**
   * Acumula el texto emitido entre on_chunk_start/on_chunk_end (delimitados por
   * los timestamps que Whisper intercala en el stream de tokens) y entrega un
   * segmento {text,start,end} completo apenas cierra, para progreso incremental.
   */
  private createStreamer(transcriber: AutomaticSpeechRecognitionPipeline, onProgress: WhisperProgressListener) {
    let windowOffsetSeconds = 0
    let maxTimeInWindow = 0
    let chunkStart = 0
    let chunkText = ''

    return new WhisperTextStreamer(transcriber.tokenizer as unknown as ConstructorParameters<typeof WhisperTextStreamer>[0], {
      skip_prompt: true,
      callback_function: (text: string) => {
        chunkText += text
      },
      on_chunk_start: (time: number) => {
        // El tiempo retrocedió respecto al máximo visto: arrancó una nueva
        // ventana de generate(), no un nuevo segmento dentro de la misma.
        if (time < maxTimeInWindow) {
          windowOffsetSeconds += WINDOW_ADVANCE_SECONDS
          maxTimeInWindow = 0
        }
        chunkStart = windowOffsetSeconds + time
        chunkText = ''
      },
      on_chunk_end: (time: number) => {
        maxTimeInWindow = Math.max(maxTimeInWindow, time)
        const text = chunkText.trim()
        if (text) {
          onProgress({ text, start: chunkStart, end: windowOffsetSeconds + time })
        }
      },
    })
  }

  private async loadTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
    if (!this.transcriberPromise) {
      this.transcriberPromise = this.createTranscriber()
    }
    return this.transcriberPromise
  }

  private async createTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
    const useWebGpu = await hasWebGpu()
    this.device = useWebGpu ? 'webgpu' : 'wasm'
    return pipeline('automatic-speech-recognition', MODEL_ID, {
      device: this.device,
      // q8 en el decoder rompe la sesión de ONNX Runtime 1.25 (bug conocido de
      // transformers.js #1707: falta el scale de dequantización del decoder
      // merged). q4 evita el bug manteniendo una descarga liviana.
      dtype: useWebGpu ? 'fp32' : { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    })
  }
}
