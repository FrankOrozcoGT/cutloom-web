import type { ClipRenderSegment, GapRenderSegment } from '@application/video/exportTypes'
import type { CanvasPort } from '@application/video/ports'

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

  compose(
    frame: VideoFrame,
    _segment: ClipRenderSegment,
    options: { dimensions: { width: number; height: number } },
  ): void {
    const { width, height } = options.dimensions
    this.resizeIfNeeded(width, height)
    this.context.drawImage(frame, 0, 0, width, height)
  }

  composeBlank(_segment: GapRenderSegment, options: { dimensions: { width: number; height: number } }): void {
    const { width, height } = options.dimensions
    this.resizeIfNeeded(width, height)
    this.context.fillStyle = 'black'
    this.context.fillRect(0, 0, width, height)
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
}
