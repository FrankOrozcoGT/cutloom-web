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

    console.log(`WhisperAdapter: audio de entrada ${audio.length} samples (${(audio.length / 16000).toFixed(1)}s @ 16kHz)`)

    let transcriber: AutomaticSpeechRecognitionPipeline
    console.time('WhisperAdapter: loadTranscriber')
    try {
      transcriber = await this.loadTranscriber()
    } catch (e) {
      console.error('WhisperAdapter: fallo al cargar el modelo', describeError(e))
      return err('MODEL_LOAD_FAILED')
    } finally {
      console.timeEnd('WhisperAdapter: loadTranscriber')
    }
    console.log(`WhisperAdapter: device=${this.device}`)

    try {
      const streamer = onProgress ? this.createStreamer(transcriber, onProgress) : undefined

      console.time('WhisperAdapter: transcribe total')
      const output = await transcriber(audio, {
        language: LANGUAGE_NAMES[options.language],
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: CHUNK_LENGTH_SECONDS,
        stride_length_s: STRIDE_LENGTH_SECONDS,
        streamer,
      })
      console.timeEnd('WhisperAdapter: transcribe total')

      const result: AutomaticSpeechRecognitionOutput = Array.isArray(output) ? output[0] : output
      const segments = (result.chunks ?? []).map((chunk) => ({
        text: chunk.text,
        start: chunk.timestamp[0],
        end: chunk.timestamp[1],
      }))
      console.log(`WhisperAdapter: ${segments.length} segmentos generados`)

      return ok({ segments, device: this.device })
    } catch (e) {
      console.timeEnd('WhisperAdapter: transcribe total')
      console.error('WhisperAdapter: fallo al transcribir', describeError(e))
      return err('TRANSCRIPTION_FAILED')
    }
  }

  /**
   * Acumula el texto emitido entre on_chunk_start/on_chunk_end (delimitados por
   * los timestamps que Whisper intercala en el stream de tokens) y entrega un
   * segmento {text,start,end} completo apenas cierra, para progreso incremental.
   *
   * Cada ventana de chunk_length_s se transcribe con un generate() separado y
   * sus timestamps son relativos al inicio de esa ventana. generate() llama
   * streamer.end() al terminar, así que on_finalize es la señal exacta de
   * cambio de ventana: el offset absoluto es windowIndex * WINDOW_ADVANCE_SECONDS
   * (el mismo paso con que el pipeline solapa las ventanas).
   */
  private createStreamer(transcriber: AutomaticSpeechRecognitionPipeline, onProgress: WhisperProgressListener) {
    let windowIndex = 0
    let chunkStart = 0
    let chunkText = ''
    let lastEmittedEnd = 0

    const streamer = new WhisperTextStreamer(transcriber.tokenizer as unknown as ConstructorParameters<typeof WhisperTextStreamer>[0], {
      skip_prompt: true,
      callback_function: (text: string) => {
        chunkText += text
      },
      on_chunk_start: (time: number) => {
        chunkStart = windowIndex * WINDOW_ADVANCE_SECONDS + time
        chunkText = ''
      },
      on_chunk_end: (time: number) => {
        const text = chunkText.trim()
        if (!text) return
        // Ruido del modelo aparte, un segmento nunca termina antes de empezar.
        const end = Math.max(windowIndex * WINDOW_ADVANCE_SECONDS + time, chunkStart)
        // Las ventanas se solapan (30s de largo, 20s de avance) y el audio del
        // borde se transcribe dos veces. Para que el progreso no retroceda se
        // descartan los segmentos ya cubiertos por la ventana anterior y se
        // recorta el inicio de los que crucen el borde. El resultado final no
        // se ve afectado: _decode_asr hace su propio recorte de strides.
        if (end <= lastEmittedEnd) return
        const start = Math.max(chunkStart, lastEmittedEnd)
        lastEmittedEnd = end
        console.log(`WhisperAdapter: segmento win=${windowIndex} [${start.toFixed(1)}s-${end.toFixed(1)}s] "${text.slice(0, 40)}"`)
        onProgress({ text, start, end })
      },
      on_finalize: () => {
        windowIndex += 1
        // Si la ventana quedó truncada a mitad de un segmento (sin timestamp de
        // cierre), el streamer sigue esperando ese cierre e interpretaría el
        // primer timestamp de la siguiente ventana como fin, invirtiendo el
        // pareo start/end de ahí en adelante. Se descarta el segmento
        // incompleto (el resultado final de result.chunks lo incluye con los
        // tiempos correctos) y se re-sincroniza el estado.
        chunkText = ''
        streamer.waiting_for_timestamp = false
      },
    })
    return streamer
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
    console.log(`WhisperAdapter: cargando modelo ${MODEL_ID} (device=${this.device})…`)
    return pipeline('automatic-speech-recognition', MODEL_ID, {
      device: this.device,
      // q8 en el decoder rompe la sesión de ONNX Runtime 1.25 (bug conocido de
      // transformers.js #1707: falta el scale de dequantización del decoder
      // merged). q4 evita el bug manteniendo una descarga liviana.
      dtype: useWebGpu ? 'fp32' : { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      progress_callback: (progress: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
        if (progress.status === 'progress' && progress.file) {
          const pct = progress.progress?.toFixed(0) ?? '?'
          const mb = progress.total ? (progress.total / 1024 / 1024).toFixed(1) : '?'
          console.log(`WhisperAdapter: descargando ${progress.file} — ${pct}% de ${mb}MB`)
        } else {
          console.log(`WhisperAdapter: ${progress.status}${progress.file ? ` (${progress.file})` : ''}`)
        }
      },
    })
  }
}
