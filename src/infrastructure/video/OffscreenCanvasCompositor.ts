import type { ClipRenderSegment, GapRenderSegment } from '@application/video/exportTypes'
import type { CanvasPort, ComposeOptions } from '@application/video/ports'

// 7% del alto está dentro del rango recomendado (7-10%) para captions
// legibles en shorts verticales — con el ancho angosto de un 9:16, un
// tamaño menor (el 4.5% anterior) se ve chico en proporción al frame.
const SUBTITLE_FONT_RATIO = 0.07
const SUBTITLE_MAX_WIDTH_RATIO = 0.9
const SUBTITLE_BOTTOM_MARGIN_RATIO = 0.08
const SUBTITLE_LINE_HEIGHT_RATIO = 1.3

/**
 * Umbral para considerar que el aspect ratio del frame fuente difiere del
 * canvas destino (ej. video horizontal 16:9 exportado a short vertical
 * 9:16) — por debajo de esto la diferencia es ruido de redondeo, no un
 * cambio real de formato.
 */
const ASPECT_RATIO_MISMATCH_THRESHOLD = 0.01

export class OffscreenCanvasCompositor implements CanvasPort {
  private canvas: OffscreenCanvas
  private context: OffscreenCanvasRenderingContext2D

  constructor() {
    this.canvas = new OffscreenCanvas(1, 1)
    const context = this.canvas.getContext('2d')
    if (!context) {
      throw new Error('No se pudo crear el contexto 2D del OffscreenCanvas de export')
    }
    this.context = context
  }

  compose(frame: VideoFrame, _segment: ClipRenderSegment, options: ComposeOptions): void {
    const { width, height } = options.dimensions
    this.resizeIfNeeded(width, height)
    this.drawFrameFitted(frame, frame.codedWidth, frame.codedHeight, width, height, options.cropOffsetX)
    if (options.subtitleText) {
      this.drawSubtitle(options.subtitleText, width, height)
    }
  }

  composeBlank(_segment: GapRenderSegment, options: ComposeOptions): void {
    const { width, height } = options.dimensions
    this.resizeIfNeeded(width, height)
    this.context.fillStyle = 'black'
    this.context.fillRect(0, 0, width, height)
    if (options.subtitleText) {
      this.drawSubtitle(options.subtitleText, width, height)
    }
  }

  // Si el aspect ratio del frame fuente no coincide con el del canvas destino
  // (típicamente: video horizontal exportado como short vertical 9:16), se
  // escala a cubrir todo el canvas y se recortan los bordes sobrantes
  // (crop-to-fill / object-fit: cover) — es el estándar para contenido de
  // pantalla completa o cámara amplia en shorts (TikTok, Reels, YouTube
  // Shorts): llenar el frame vertical entero es más legible que mostrar el
  // video completo achicado con relleno arriba/abajo.
  private drawFrameFitted(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    canvasWidth: number,
    canvasHeight: number,
    cropOffsetX = 0.5,
  ): void {
    const ctx = this.context
    const sourceRatio = sourceWidth / sourceHeight
    const canvasRatio = canvasWidth / canvasHeight

    if (Math.abs(sourceRatio - canvasRatio) < ASPECT_RATIO_MISMATCH_THRESHOLD) {
      ctx.drawImage(source, 0, 0, canvasWidth, canvasHeight)
      return
    }

    const coverScale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
    const coverWidth = sourceWidth * coverScale
    const coverHeight = sourceHeight * coverScale
    const maxOffsetX = canvasWidth - coverWidth
    const maxOffsetY = canvasHeight - coverHeight
    // cropOffsetX en [0,1] interpola entre mostrar el borde izquierdo (0) y
    // el derecho (1) del contenido escalado — 0.5 es el centrado de siempre.
    // El eje vertical no tiene ajuste manual: se mantiene centrado.
    ctx.drawImage(source, maxOffsetX * cropOffsetX, maxOffsetY / 2, coverWidth, coverHeight)
  }

  getCanvas(): OffscreenCanvas {
    return this.canvas
  }

  private resizeIfNeeded(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
  }

  // Quema el subtítulo dentro del ancho del video: mide cada línea candidata con
  // measureText (canvas no hace word-wrap solo) y corta antes de que se salga
  // del maxWidth, en vez de confiar en que el texto entre en una sola línea.
  private drawSubtitle(text: string, width: number, height: number): void {
    const ctx = this.context
    const fontSize = Math.round(height * SUBTITLE_FONT_RATIO)
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    const maxWidth = width * SUBTITLE_MAX_WIDTH_RATIO
    const lines = this.wrapText(text, maxWidth)
    const lineHeight = fontSize * SUBTITLE_LINE_HEIGHT_RATIO
    const bottomMargin = height * SUBTITLE_BOTTOM_MARGIN_RATIO

    ctx.lineWidth = fontSize * 0.15
    ctx.strokeStyle = 'black'
    ctx.fillStyle = 'white'
    lines.forEach((line, i) => {
      const y = height - bottomMargin - (lines.length - 1 - i) * lineHeight
      ctx.strokeText(line, width / 2, y)
      ctx.fillText(line, width / 2, y)
    })
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const ctx = this.context
    const words = text.split(' ')
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (current && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
    return lines
  }
}
