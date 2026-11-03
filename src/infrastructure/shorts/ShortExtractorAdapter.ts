import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny'
import type { Render } from '@domain/render'
import { SHORT_HEIGHT, SHORT_WIDTH } from '@domain/shorts'
import { AUDIO_ENCODE_CODEC } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { ExtractShortError, ShortExtractorPort } from '@application/shorts/ExtractShortUseCase'
import { describeError } from '@infrastructure/errors'

/** Recorta [startMs, endMs) del render ya existente y aplica el encuadre vertical — nunca decodifica los VideoAsset originales, trabaja siempre sobre el render ya aplanado. */
export class ShortExtractorAdapter implements ShortExtractorPort {
  async extract(render: Render, startMs: number, endMs: number, cropOffsetX: number): Promise<Result<Blob, ExtractShortError>> {
    try {
      const input = new Input({ source: new BlobSource(render.blob), formats: ALL_FORMATS })
      const videoTrack = await input.getPrimaryVideoTrack()
      if (!videoTrack) {
        return err('UNSUPPORTED_API')
      }

      const target = new BufferTarget()
      const output = new Output({ format: new Mp4OutputFormat(), target })

      const sourceWidth = videoTrack.displayWidth
      const sourceHeight = videoTrack.displayHeight
      const crop = this.verticalCropRect(sourceWidth, sourceHeight, cropOffsetX)

      const conversion = await Conversion.init({
        input,
        output,
        trim: { start: startMs / 1000, end: endMs / 1000 },
        video: { width: SHORT_WIDTH, height: SHORT_HEIGHT, fit: 'cover', crop, codec: 'avc' },
        audio: { codec: AUDIO_ENCODE_CODEC },
      })

      if (!conversion.isValid) {
        return err('UNSUPPORTED_API')
      }

      await conversion.execute()

      if (!target.buffer) {
        return err('MUX_FAILED')
      }

      return ok(new Blob([target.buffer], { type: 'video/mp4' }))
    } catch (e) {
      console.error('ShortExtractorAdapter: fallo al extraer el short', describeError(e))
      return err('ENCODING_ERROR')
    }
  }

  /** Recorta el ancho fuente al aspect ratio vertical destino, deslizando la ventana horizontalmente según cropOffsetX (0 = borde izquierdo, 0.5 = centrado, 1 = borde derecho). */
  private verticalCropRect(
    sourceWidth: number,
    sourceHeight: number,
    cropOffsetX: number,
  ): { left: number; top: number; width: number; height: number } {
    const targetRatio = SHORT_WIDTH / SHORT_HEIGHT
    const sourceRatio = sourceWidth / sourceHeight

    if (sourceRatio <= targetRatio) {
      return { left: 0, top: 0, width: sourceWidth, height: sourceHeight }
    }

    const croppedWidth = sourceHeight * targetRatio
    const maxLeft = sourceWidth - croppedWidth
    return { left: maxLeft * cropOffsetX, top: 0, width: croppedWidth, height: sourceHeight }
  }
}
