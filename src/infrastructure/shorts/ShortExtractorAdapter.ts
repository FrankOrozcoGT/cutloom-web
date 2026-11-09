import { BufferTarget, Conversion, Mp4OutputFormat, Output } from 'mediabunny'
import type { CropRectangle, VideoSample } from 'mediabunny'
import type { Render } from '@domain/render'
import { SHORT_HEIGHT, SHORT_WIDTH, interpolateCropOffsetX, type EffectiveShortFraming } from '@domain/shorts'
import { AUDIO_ENCODE_CODEC } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { ExtractShortError, ShortExtractorPort } from '@application/shorts/ports'
import { describeError } from '@infrastructure/errors'
import { openRenderVideoTrack } from './openRenderVideoTrack'

/** Recorta el ancho fuente al aspect ratio vertical destino, deslizando la ventana horizontalmente según cropOffsetX (0 = borde izquierdo, 0.5 = centrado, 1 = borde derecho). mediabunny exige left/top/width/height enteros — cropOffsetX interpolado (ver interpolateCropOffsetX) casi nunca da un left redondo, así que se trunca acá, en el único punto que construye el CropRectangle real. */
function verticalCropRect(sourceWidth: number, sourceHeight: number, cropOffsetX: number): CropRectangle {
  const targetRatio = SHORT_WIDTH / SHORT_HEIGHT
  const sourceRatio = sourceWidth / sourceHeight

  if (sourceRatio <= targetRatio) {
    return { left: 0, top: 0, width: sourceWidth, height: sourceHeight }
  }

  const croppedWidth = Math.round(sourceHeight * targetRatio)
  const maxLeft = sourceWidth - croppedWidth
  const left = Math.min(maxLeft, Math.max(0, Math.round(maxLeft * cropOffsetX)))
  return { left, top: 0, width: croppedWidth, height: sourceHeight }
}

/** Recorta [startMs, endMs) del render ya existente y aplica el encuadre vertical — nunca decodifica los VideoAsset originales, trabaja siempre sobre el render ya aplanado. */
export class ShortExtractorAdapter implements ShortExtractorPort {
  async extract(render: Render, startMs: number, endMs: number, framing: EffectiveShortFraming): Promise<Result<Blob, ExtractShortError>> {
    try {
      const { input, videoTrack } = await openRenderVideoTrack(render)
      if (!videoTrack) {
        return err('UNSUPPORTED_API')
      }

      const target = new BufferTarget()
      const output = new Output({ format: new Mp4OutputFormat(), target })

      const sourceWidth = videoTrack.displayWidth
      const sourceHeight = videoTrack.displayHeight

      const conversion = await Conversion.init({
        input,
        output,
        trim: { start: startMs / 1000, end: endMs / 1000 },
        video:
          framing.mode === 'fixed'
            ? {
                width: SHORT_WIDTH,
                height: SHORT_HEIGHT,
                fit: 'cover',
                crop: verticalCropRect(sourceWidth, sourceHeight, framing.cropOffsetX),
                codec: 'avc',
              }
            : {
                // Sin width/height/fit acá: Conversion aplicaría su propio
                // resize ANTES de pasar el sample a process (ver doc de
                // process: "after transformations and frame rate
                // corrections") — con fit:'fill' eso estiraba el frame
                // horizontal original a 1080x1920 sin preservar aspect
                // ratio, y el crop de abajo, calculado sobre las
                // dimensiones del track original (nunca las del sample ya
                // estirado que de verdad llega), recortaba sobre coordenadas
                // que no correspondían a lo que process recibía: resultado,
                // el short se veía alargado y solo con la mitad superior.
                // El único resize/crop real debe pasar por sample.transform
                // de abajo, sobre el sample crudo tal cual sale del decoder.
                codec: 'avc',
                processedWidth: SHORT_WIDTH,
                processedHeight: SHORT_HEIGHT,
                process: async (sample: VideoSample) => {
                  // sample.timestamp ya es relativo al inicio del tramo recortado
                  // (trim.start de Conversion.init de abajo), no al render completo
                  // — restar startMs otra vez lo volvía negativo durante todo el
                  // clip, clavando interpolateCropOffsetX en su primer keyframe y
                  // anulando el seguimiento real del movimiento.
                  const atMs = sample.timestamp * 1000
                  const cropOffsetX = interpolateCropOffsetX(framing.keyframes, atMs)
                  const crop = verticalCropRect(sourceWidth, sourceHeight, cropOffsetX)
                  return sample.transform({ width: SHORT_WIDTH, height: SHORT_HEIGHT, fit: 'cover', crop })
                },
              },
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
}
