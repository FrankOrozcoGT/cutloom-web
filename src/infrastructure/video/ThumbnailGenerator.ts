import { err, ok, type Result } from '@application/result'
import type { ThumbnailError, ThumbnailGenerator as ThumbnailGeneratorPort } from '@application/video/ports'

export class ThumbnailGenerator implements ThumbnailGeneratorPort {
  async generate(file: File): Promise<Result<Blob, ThumbnailError>> {
    const url = URL.createObjectURL(file)
    try {
      const video = document.createElement('video')
      video.muted = true
      video.src = url

      await this.waitForLoadedData(video)
      await this.seekToStart(video)

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d')
      if (!context) {
        return err('THUMBNAIL_FAILED')
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      const blob = await this.canvasToBlob(canvas)
      if (!blob) {
        return err('THUMBNAIL_FAILED')
      }
      return ok(blob)
    } catch {
      return err('THUMBNAIL_FAILED')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  private waitForLoadedData(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(video.error), { once: true })
    })
  }

  private seekToStart(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
      video.addEventListener('seeked', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(video.error), { once: true })
      video.currentTime = 0
    })
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  }
}
