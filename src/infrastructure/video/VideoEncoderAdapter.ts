import { AudioSample, AudioSampleSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } from 'mediabunny'
import { AUDIO_ENCODE_CODEC } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { CanvasPort, EncodeError, MediaMuxerPort, RenderOptions } from '@application/render/ports'
import { describeError } from '@infrastructure/errors'

const AUDIO_BITRATE = 128_000

function classifyError(error: unknown): EncodeError {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'INSUFFICIENT_MEMORY'
  }
  if (error instanceof RangeError || (error instanceof Error && /memory/i.test(error.message))) {
    return 'INSUFFICIENT_MEMORY'
  }
  return 'ENCODING_ERROR'
}

export class VideoEncoderAdapter implements MediaMuxerPort {
  private readonly compositor: CanvasPort
  private output: Output | null = null
  private target: BufferTarget | null = null
  private videoSource: CanvasSource | null = null
  private audioSource: AudioSampleSource | null = null

  constructor(compositor: CanvasPort) {
    this.compositor = compositor
  }

  async start(options: RenderOptions, hasAudio: boolean): Promise<Result<void, EncodeError>> {
    this.target = new BufferTarget()
    this.output = new Output({ format: new Mp4OutputFormat(), target: this.target })

    this.videoSource = new CanvasSource(this.compositor.getCanvas(), {
      codec: 'avc',
      quality: new Quality('high'),
    })
    this.output.addVideoTrack(this.videoSource, { frameRate: options.fps })

    if (hasAudio) {
      const audioSupport = await AudioEncoder.isConfigSupported({
        codec: AUDIO_ENCODE_CODEC,
        sampleRate: 48_000,
        numberOfChannels: 2,
        bitrate: AUDIO_BITRATE,
      })
      if (!audioSupport.supported) {
        return err('UNSUPPORTED_CODEC')
      }
      this.audioSource = new AudioSampleSource({ codec: AUDIO_ENCODE_CODEC, bitrate: AUDIO_BITRATE })
      this.output.addAudioTrack(this.audioSource)
    }

    try {
      await this.output.start()
      return ok(undefined)
    } catch (e) {
      console.error('VideoEncoderAdapter: fallo al iniciar el Output', describeError(e))
      return err(classifyError(e))
    }
  }

  async writeVideoFrame(timestampSeconds: number, durationSeconds: number): Promise<Result<void, EncodeError>> {
    if (!this.videoSource) {
      return err('ENCODING_ERROR')
    }
    try {
      await this.videoSource.add(timestampSeconds, durationSeconds)
      return ok(undefined)
    } catch (e) {
      console.error('VideoEncoderAdapter: fallo al encodear frame de video', describeError(e))
      return err(classifyError(e))
    }
  }

  async writeAudioSample(data: AudioData, timestampSeconds: number): Promise<Result<void, EncodeError>> {
    if (!this.audioSource) {
      return ok(undefined)
    }
    try {
      const format = data.format!
      const isPlanar = format.endsWith('-planar')
      const planeCount = isPlanar ? data.numberOfChannels : 1

      const planeSizes: number[] = []
      let totalSize = 0
      for (let plane = 0; plane < planeCount; plane += 1) {
        const planeSize = data.allocationSize({ planeIndex: plane, format })
        planeSizes.push(planeSize)
        totalSize += planeSize
      }

      const buffer = new ArrayBuffer(totalSize)
      let offset = 0
      for (let plane = 0; plane < planeCount; plane += 1) {
        data.copyTo(new Uint8Array(buffer, offset, planeSizes[plane]), { planeIndex: plane, format })
        offset += planeSizes[plane]
      }

      const sample = new AudioSample({
        data: buffer,
        format,
        numberOfChannels: data.numberOfChannels,
        sampleRate: data.sampleRate,
        timestamp: timestampSeconds,
      })
      try {
        await this.audioSource.add(sample)
      } finally {
        sample.close()
      }
      return ok(undefined)
    } catch (e) {
      console.error('VideoEncoderAdapter: fallo al encodear sample de audio', describeError(e))
      return err(classifyError(e))
    }
  }

  async finalize(): Promise<Result<Blob, EncodeError>> {
    if (!this.output || !this.target) {
      return err('ENCODING_ERROR')
    }
    try {
      await this.output.finalize()
      if (!this.target.buffer) {
        return err('MUX_FAILED')
      }
      return ok(new Blob([this.target.buffer], { type: 'video/mp4' }))
    } catch (e) {
      console.error('VideoEncoderAdapter: fallo al finalizar el Output', describeError(e))
      return err(classifyError(e))
    }
  }

  async abort(): Promise<void> {
    if (!this.output) return
    try {
      await this.output.cancel()
    } catch (e) {
      console.error('VideoEncoderAdapter: fallo al cancelar el Output', describeError(e))
    }
  }
}
