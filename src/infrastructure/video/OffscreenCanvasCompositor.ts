import type { ClipRenderSegment, GapRenderSegment } from '@application/video/exportTypes'
import type { CanvasPort, ComposeOptions } from '@application/video/ports'

const SUBTITLE_FONT_RATIO = 0.045
const SUBTITLE_MAX_WIDTH_RATIO = 0.9
const SUBTITLE_BOTTOM_MARGIN_RATIO = 0.08
const SUBTITLE_LINE_HEIGHT_RATIO = 1.3

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
    this.context.drawImage(frame, 0, 0, width, height)
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
