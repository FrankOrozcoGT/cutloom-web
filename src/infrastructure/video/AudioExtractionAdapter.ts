import { AudioSampleSink, ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import type { RenderSegment } from '@application/video/exportTypes'
import { err, ok, type Result } from '@application/result'
import type { AudioExtractError, AudioExtractorPort, AudioExtractProgressListener } from '@application/subtitles/ports'
import { describeError } from '@infrastructure/errors'

const TARGET_SAMPLE_RATE = 16000

interface PlacedBuffer {
  /** Offset dentro del audio final (tiempo de timeline), en segundos. */
  outputStartSeconds: number
  buffer: AudioBuffer
}

/**
 * Decodifica y concatena el audio del timeline compuesto (mediabunny), en su
 * orden de salida, a mono 16kHz para Whisper. Los huecos del timeline (sin
 * clip activo) quedan en silencio para no correr los timestamps.
 */
export class AudioExtractionAdapter implements AudioExtractorPort {
  async extract(
    segments: RenderSegment[],
    onProgress?: AudioExtractProgressListener,
  ): Promise<Result<Float32Array, AudioExtractError>> {
    if (typeof OfflineAudioContext === 'undefined') {
      return err('UNSUPPORTED_API')
    }

    try {
      const placedBuffers: PlacedBuffer[] = []
      let hasAudio = false

      for (const segment of segments) {
        if (segment.kind === 'gap') {
          onProgress?.(segment.outputStartMs + segment.outputDurationMs)
          continue
        }

        const buffer = await this.decodeSegment(segment)

        if (buffer) {
          hasAudio = true
          placedBuffers.push({ outputStartSeconds: segment.outputStartMs / 1000, buffer })
        }
        onProgress?.(segment.outputStartMs + segment.outputDurationMs)
      }

      if (!hasAudio) {
        return err('NO_AUDIO_TRACK')
      }

      const totalDurationMs = Math.max(
        ...segments.map((segment) => segment.outputStartMs + segment.outputDurationMs),
      )
      const mono16k = await this.mixToMono16k(placedBuffers, totalDurationMs / 1000)
      return ok(mono16k)
    } catch (e) {
      console.error('AudioExtractionAdapter: fallo al extraer audio', describeError(e))
      return err('DECODE_FAILED')
    }
  }

  private async decodeSegment(segment: Extract<RenderSegment, { kind: 'clip' }>): Promise<AudioBuffer | null> {
    try {
      const input = new Input({ source: new BlobSource(segment.asset.blob), formats: ALL_FORMATS })
      const track = await input.getPrimaryAudioTrack()
      if (!track) return null

      const canDecode = await track.canDecode()
      if (!canDecode) return null

      const sink = new AudioSampleSink(track)
      const buffers: AudioBuffer[] = []
      for await (const sample of sink.samples(segment.sourceStartMs / 1000, segment.sourceEndMs / 1000)) {
        try {
          buffers.push(sample.toAudioBuffer())
        } finally {
          sample.close()
        }
      }

      if (buffers.length === 0) return null
      return this.concatBuffers(buffers)
    } catch (e) {
      console.error('AudioExtractionAdapter: fallo al decodificar segmento', segment.assetId, describeError(e))
      return null
    }
  }

  private concatBuffers(buffers: AudioBuffer[]): AudioBuffer {
    if (buffers.length === 1) return buffers[0]
    const sampleRate = buffers[0].sampleRate
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0)
    const merged = new OfflineAudioContext(1, totalLength, sampleRate)
    // No hace falta renderizar acá: alcanza con un AudioBuffer contenedor donde
    // copiamos las muestras directamente, evitando un render intermedio extra.
    const output = merged.createBuffer(1, totalLength, sampleRate)
    const channel = output.getChannelData(0)
    let offset = 0
    for (const buffer of buffers) {
      channel.set(buffer.getChannelData(0), offset)
      offset += buffer.length
    }
    return output
  }

  private async mixToMono16k(placedBuffers: PlacedBuffer[], totalDurationSeconds: number): Promise<Float32Array> {
    const targetLength = Math.ceil(totalDurationSeconds * TARGET_SAMPLE_RATE)
    const offlineContext = new OfflineAudioContext(1, Math.max(1, targetLength), TARGET_SAMPLE_RATE)

    for (const { outputStartSeconds, buffer } of placedBuffers) {
      const source = offlineContext.createBufferSource()
      source.buffer = buffer
      source.connect(offlineContext.destination)
      source.start(outputStartSeconds)
    }

    const rendered = await offlineContext.startRendering()
    return rendered.getChannelData(0)
  }
}
