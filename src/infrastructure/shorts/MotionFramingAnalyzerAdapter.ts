import { CanvasSink } from 'mediabunny'
import type { Render } from '@domain/render'
import {
  findMotionCenter,
  normalizedRectCenter,
  smoothMotionPath,
  type AutoFrameKeyframe,
  type NormalizedRect,
} from '@domain/shorts'
import { err, ok, type Result } from '@application/result'
import type { AnalyzeMotionFramingError, MotionFramingAnalyzerPort } from '@application/shorts/ports'
import { describeError } from '@infrastructure/errors'
import { openRenderVideoTrack } from './openRenderVideoTrack'

/**
 * Resolución de análisis — no hace falta el frame completo para detectar
 * dónde hay movimiento, y reducirlo acelera tanto el decode (CanvasSink ya
 * resize-ea) como el cómputo de diferencia por pixel.
 */
const ANALYSIS_WIDTH = 160
const ANALYSIS_HEIGHT = 90

/** Cuántas muestras por segundo se analizan — más que esto es trabajo redundante para un cursor/contenido que no cambia frame a frame. */
const SAMPLES_PER_SECOND = 4

/** Valor de diferencia (0-255, luma) por debajo del cual un pixel se considera "sin cambio" — ruido de compresión/grano, no movimiento real. */
const DIFF_THRESHOLD = 25

/** Fracción del radio normalizado (0-1, diagonal del frame) que debe recorrer el centro de movimiento para que el encuadre reaccione — evita temblor ante ruido. */
const DEAD_ZONE_RADIUS = 0.04

/** Qué tan rápido el encuadre alcanza su destino en cada muestra — valor bajo = paneo lento y fluido, alto = reacciona casi instantáneo. */
const EMA_ALPHA = 0.15

/** Cuánto tiempo sin movimiento debe sostenerse antes de empezar a volver al centro del avatar — evita que una pausa breve del cursor dispare un viaje de ida y vuelta innecesario. */
const REST_HOLD_MS = 1500
const REST_HOLD_SAMPLES = Math.round((REST_HOLD_MS / 1000) * SAMPLES_PER_SECOND)

function toGrayscale(imageData: ImageData): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(imageData.width * imageData.height)
  for (let i = 0; i < gray.length; i += 1) {
    const offset = i * 4
    gray[i] = 0.299 * imageData.data[offset] + 0.587 * imageData.data[offset + 1] + 0.114 * imageData.data[offset + 2]
  }
  return gray
}

function diffGrayscale(a: Uint8ClampedArray, b: Uint8ClampedArray): Uint8ClampedArray {
  const diff = new Uint8ClampedArray(a.length)
  for (let i = 0; i < a.length; i += 1) {
    diff[i] = Math.abs(a[i] - b[i])
  }
  return diff
}

/**
 * Analiza movimiento por diferencia de frames consecutivos (sin IA): decodifica
 * el tramo del render a resolución reducida, calcula el centro de masa del
 * cambio ignorando la región del avatar, y suaviza la trayectoria resultante
 * con EMA + zona muerta + retorno al centro del avatar en reposo.
 */
export class MotionFramingAnalyzerAdapter implements MotionFramingAnalyzerPort {
  async analyze(
    render: Render,
    startMs: number,
    endMs: number,
    excludeRect: NormalizedRect | null,
  ): Promise<Result<AutoFrameKeyframe[], AnalyzeMotionFramingError>> {
    try {
      const { videoTrack } = await openRenderVideoTrack(render)
      if (!videoTrack) {
        return err('UNSUPPORTED_API')
      }

      const sink = new CanvasSink(videoTrack, { width: ANALYSIS_WIDTH, height: ANALYSIS_HEIGHT, fit: 'fill' })
      const canvas = new OffscreenCanvas(ANALYSIS_WIDTH, ANALYSIS_HEIGHT)
      const context = canvas.getContext('2d')
      if (!context) {
        return err('UNSUPPORTED_API')
      }

      const stepMs = 1000 / SAMPLES_PER_SECOND
      const rawPoints: ({ x: number; y: number } | null)[] = []
      const sampleAtMs: number[] = []
      let previousGray: Uint8ClampedArray | null = null

      for (let atMs = startMs; atMs < endMs; atMs += stepMs) {
        const wrapped = await sink.getCanvas(atMs / 1000)
        if (!wrapped) {
          rawPoints.push(null)
          sampleAtMs.push(atMs - startMs)
          continue
        }
        context.drawImage(wrapped.canvas, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT)
        const gray = toGrayscale(context.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT))

        if (previousGray) {
          const diff = diffGrayscale(gray, previousGray)
          rawPoints.push(findMotionCenter(diff, ANALYSIS_WIDTH, ANALYSIS_HEIGHT, DIFF_THRESHOLD, excludeRect))
        } else {
          rawPoints.push(null)
        }
        sampleAtMs.push(atMs - startMs)
        previousGray = gray
      }

      const restPoint = excludeRect ? normalizedRectCenter(excludeRect) : { x: 0.5, y: 0.5 }
      const smoothed = smoothMotionPath(rawPoints, EMA_ALPHA, DEAD_ZONE_RADIUS, restPoint, REST_HOLD_SAMPLES)

      const keyframes: AutoFrameKeyframe[] = smoothed.map((point, index) => ({
        atMs: sampleAtMs[index],
        cropOffsetX: point.x,
      }))

      return ok(keyframes)
    } catch (e) {
      console.error('MotionFramingAnalyzerAdapter: fallo al analizar movimiento', describeError(e))
      return err('DECODE_FAILED')
    }
  }
}
