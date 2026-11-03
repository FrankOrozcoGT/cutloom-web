import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny'
import { AUDIO_ENCODE_CODEC, type ProxyAsset, type VideoAsset } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { ProxyError, ProxyGeneratorPort, ProxyProgressListener } from '@application/video/ports'
import { describeError } from '@infrastructure/errors'

const PROXY_SHORT_SIDE_PX = 960
const PROXY_MAX_FPS = 30

function nextProxyId(): string {
  return `proxy-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Genera, a partir del original, una copia liviana con índice de seek
 * propio: MP4/H.264, lado corto acotado a 960px, mismo framerate con tope
 * de 30fps. Es la pieza que permite editar con scrubbing y seek libre sin
 * depender del contenedor del original (que puede no tener índice de seek,
 * p.ej. un .webm grabado con MediaRecorder).
 */
export class ProxyGeneratorAdapter implements ProxyGeneratorPort {
  async generate(asset: VideoAsset, onProgress?: ProxyProgressListener): Promise<Result<ProxyAsset, ProxyError>> {
    try {
      const input = new Input({ source: new BlobSource(asset.blob), formats: ALL_FORMATS })

      const canRead = await input.canRead()
      if (!canRead) {
        return err('UNSUPPORTED_CODEC')
      }

      const videoTrack = await input.getPrimaryVideoTrack()
      if (!videoTrack) {
        return err('UNSUPPORTED_CODEC')
      }

      const { width, height } = this.proxyDimensions(videoTrack.displayWidth, videoTrack.displayHeight)
      const sourceFps = await videoTrack.computePacketStats(100).then((stats) => stats.averagePacketRate).catch(() => PROXY_MAX_FPS)

      const target = new BufferTarget()
      const output = new Output({ format: new Mp4OutputFormat(), target })

      const conversion = await Conversion.init({
        input,
        output,
        video: { width, height, fit: 'fill', frameRate: Math.min(sourceFps, PROXY_MAX_FPS), codec: 'avc' },
        audio: { codec: AUDIO_ENCODE_CODEC },
      })

      if (!conversion.isValid) {
        return err('UNSUPPORTED_CODEC')
      }

      if (onProgress) {
        conversion.onProgress = (progress) => onProgress(progress)
      }

      await conversion.execute()

      if (!target.buffer) {
        return err('MUX_FAILED')
      }

      const blob = new Blob([target.buffer], { type: 'video/mp4' })
      return ok({
        id: nextProxyId(),
        videoAssetId: asset.id,
        projectId: asset.projectId,
        blob,
        durationMs: asset.durationMs,
        createdAt: new Date().toISOString(),
      })
    } catch (e) {
      console.error('ProxyGeneratorAdapter: fallo al generar el proxy', asset.id, describeError(e))
      return err('ENCODING_ERROR')
    }
  }

  private proxyDimensions(width: number, height: number): { width: number; height: number } {
    const shortSide = Math.min(width, height)
    if (shortSide <= PROXY_SHORT_SIDE_PX) {
      return { width, height }
    }
    const scale = PROXY_SHORT_SIDE_PX / shortSide
    return { width: Math.round(width * scale), height: Math.round(height * scale) }
  }
}
