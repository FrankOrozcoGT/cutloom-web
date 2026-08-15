import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, VideoSampleSink } from 'mediabunny'
import type { ClipRenderSegment } from '@application/video/exportTypes'
import type { AudioSampleHandler, VideoDecoderPort, VideoFrameHandler } from '@application/video/ports'
import { describeError } from '@infrastructure/errors'

/**
 * Remapea timestamps de samples decodificados (relativos al inicio real de la
 * pista, que puede no ser 0) a la posición del timeline compuesto: el primer
 * sample visto define el origen, y cada uno siguiente se ubica a partir de
 * outputStartSeconds + su desplazamiento respecto a ese origen.
 */
class TimestampRemapper {
  private readonly outputStartSeconds: number
  private firstSampleTimestamp: number | null = null

  constructor(outputStartSeconds: number) {
    this.outputStartSeconds = outputStartSeconds
  }

  toOutputSeconds(sampleTimestamp: number): number {
    if (this.firstSampleTimestamp === null) {
      this.firstSampleTimestamp = sampleTimestamp
    }
    return this.outputStartSeconds + Math.max(0, sampleTimestamp - this.firstSampleTimestamp)
  }
}

export class VideoDecoderAdapter implements VideoDecoderPort {
  async hasAudioTrack(segment: ClipRenderSegment): Promise<boolean> {
    try {
      const input = new Input({ source: new BlobSource(segment.asset.blob), formats: ALL_FORMATS })
      const track = await input.getPrimaryAudioTrack()
      if (!track) return false
      return await track.canDecode()
    } catch (e) {
      console.error('VideoDecoderAdapter: fallo al comprobar pista de audio', segment.assetId, describeError(e))
      return false
    }
  }

  async decodeSegment(
    segment: ClipRenderSegment,
    onVideoFrame: VideoFrameHandler,
    onAudioSample: AudioSampleHandler,
  ): Promise<void> {
    const input = new Input({ source: new BlobSource(segment.asset.blob), formats: ALL_FORMATS })
    const startSeconds = segment.sourceStartMs / 1000
    const endSeconds = segment.sourceEndMs / 1000
    const outputStartSeconds = segment.outputStartMs / 1000

    await this.decodeVideoTrack(input, segment, startSeconds, endSeconds, outputStartSeconds, onVideoFrame)
    await this.decodeAudioTrack(input, segment, startSeconds, endSeconds, outputStartSeconds, onAudioSample)
  }

  private async decodeVideoTrack(
    input: Input,
    segment: ClipRenderSegment,
    startSeconds: number,
    endSeconds: number,
    outputStartSeconds: number,
    onVideoFrame: VideoFrameHandler,
  ): Promise<void> {
    let track: Awaited<ReturnType<Input['getPrimaryVideoTrack']>> = null

    try {
      const canRead = await input.canRead()
      if (!canRead) {
        console.error('VideoDecoderAdapter: formato de contenedor no reconocido para el asset', segment.assetId)
        return
      }

      track = await input.getPrimaryVideoTrack()
      if (!track) {
        console.error('VideoDecoderAdapter: el asset no tiene pista de video', segment.assetId)
        return
      }

      const isSupported = await track.canDecode()
      if (!isSupported) {
        console.error('VideoDecoderAdapter: codec de video no soportado para el asset', segment.assetId)
        return
      }
    } catch (e) {
      console.error('VideoDecoderAdapter: fallo al leer la pista de video', segment.assetId, describeError(e))
      return
    }

    const sink = new VideoSampleSink(track)
    const packetStats = await track.computePacketStats(100).catch(() => null)
    const averageFrameDuration = packetStats && packetStats.averagePacketRate > 0 ? 1 / packetStats.averagePacketRate : 1 / 30

    const remapper = new TimestampRemapper(outputStartSeconds)

    try {
      for await (const sample of sink.samples(startSeconds, endSeconds)) {
        const frame = sample.toVideoFrame()
        const duration = sample.duration || averageFrameDuration
        const outputTimestampSeconds = remapper.toOutputSeconds(sample.timestamp)
        try {
          await onVideoFrame(frame, outputTimestampSeconds, duration)
        } finally {
          frame.close()
          sample.close()
        }
      }
    } catch (e) {
      console.error('VideoDecoderAdapter: fallo al decodificar video del asset', segment.assetId, describeError(e))
    }
  }

  private async decodeAudioTrack(
    input: Input,
    segment: ClipRenderSegment,
    startSeconds: number,
    endSeconds: number,
    outputStartSeconds: number,
    onAudioSample: AudioSampleHandler,
  ): Promise<void> {
    let track: Awaited<ReturnType<Input['getPrimaryAudioTrack']>> = null

    try {
      track = await input.getPrimaryAudioTrack()
      if (!track) {
        return
      }

      const isSupported = await track.canDecode()
      if (!isSupported) {
        console.error('VideoDecoderAdapter: codec de audio no soportado para el asset', segment.assetId)
        return
      }
    } catch (e) {
      console.error('VideoDecoderAdapter: fallo al leer la pista de audio', segment.assetId, describeError(e))
      return
    }

    const sink = new AudioSampleSink(track)
    const remapper = new TimestampRemapper(outputStartSeconds)

    try {
      for await (const sample of sink.samples(startSeconds, endSeconds)) {
        const data = sample.toAudioData()
        const outputTimestampSeconds = remapper.toOutputSeconds(sample.timestamp)
        try {
          await onAudioSample(data, outputTimestampSeconds)
        } finally {
          data.close()
          sample.close()
        }
      }
    } catch (e) {
      console.error('VideoDecoderAdapter: fallo al decodificar audio del asset', segment.assetId, describeError(e))
    }
  }
}
