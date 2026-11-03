import { err, ok, type Result } from '@application/result'
import type { DurationError, DurationReader } from '@application/video/ports'

export class DurationReaderAdapter implements DurationReader {
  async read(file: File): Promise<Result<number, DurationError>> {
    const url = URL.createObjectURL(file)
    try {
      const video = document.createElement('video')
      video.muted = true
      video.src = url

      const durationSeconds = await this.waitForMetadata(video)
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        return err('DURATION_READ_FAILED')
      }
      return ok(Math.round(durationSeconds * 1000))
    } catch {
      return err('DURATION_READ_FAILED')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  private waitForMetadata(video: HTMLVideoElement): Promise<number> {
    return new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(video.duration), { once: true })
      video.addEventListener('error', () => reject(video.error), { once: true })
    })
  }
}
