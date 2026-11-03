import { err, ok, type Result } from '@application/result'
import type { FilePicker, VideoPickerError } from '@application/video/ports'

interface FileSystemFileHandleLike {
  getFile(): Promise<File>
}

interface ShowOpenFilePickerOptions {
  multiple?: boolean
  types?: { description: string; accept: Record<string, string[]> }[]
}

type WindowWithFilePicker = Window &
  typeof globalThis & {
    showOpenFilePicker?: (options?: ShowOpenFilePickerOptions) => Promise<FileSystemFileHandleLike[]>
  }

export class FilePickerAdapter implements FilePicker {
  async pickVideoFiles(): Promise<Result<File[], VideoPickerError>> {
    const win = window as WindowWithFilePicker
    if ('showOpenFilePicker' in win && win.showOpenFilePicker) {
      try {
        const handles = await win.showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: 'Video',
              accept: { 'video/mp4': ['.mp4'], 'video/webm': ['.webm'] },
            },
          ],
        })
        const files = await Promise.all(handles.map((handle) => handle.getFile()))
        return ok(files)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return this.pickWithInput()
        }
        return err('PICKER_FAILED')
      }
    }
    return this.pickWithInput()
  }

  private pickWithInput(): Promise<Result<File[], VideoPickerError>> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'video/mp4,video/webm'
      input.multiple = true

      input.addEventListener('change', () => {
        const files = input.files ? Array.from(input.files) : []
        resolve(ok(files))
      })

      input.addEventListener('cancel', () => {
        resolve(ok([]))
      })

      input.click()
    })
  }
}
