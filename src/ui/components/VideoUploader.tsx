import { useCallback, useEffect, useState, type DragEvent, type KeyboardEvent } from 'react'
import type { UploadError, VideoUploadResult } from '@domain/video'
import { useVideoUpload, type UploadState } from '@ui/hooks/useVideoUpload'

const ERROR_MESSAGES: Record<UploadError, string> = {
  UNSUPPORTED_FORMAT: 'Formato no soportado. Usa MP4 o WebM.',
  FILE_TOO_LARGE: 'Archivo demasiado grande. Máximo 2GB.',
  STORAGE_FULL: 'No hay espacio suficiente en el navegador para guardar el video.',
  THUMBNAIL_FAILED: 'No se pudo generar el thumbnail del video.',
  DURATION_READ_FAILED: 'No se pudo leer la duración del video.',
  UNKNOWN_ERROR: 'Ocurrió un error inesperado al subir el video.',
}

const LOADING_STATES: UploadState[] = ['picking', 'validating', 'uploading', 'generating_thumbnail']

interface VideoUploaderProps {
  projectId: string
  onUploaded?: (results: VideoUploadResult[]) => void
}

export function VideoUploader({ projectId, onUploaded }: VideoUploaderProps) {
  const { state, results, errors, upload, uploadFiles } = useVideoUpload(projectId)
  const [isDragging, setIsDragging] = useState(false)
  const isLoading = LOADING_STATES.includes(state)

  useEffect(() => {
    if (state === 'success' && results.length > 0) {
      onUploaded?.(results)
    }
  }, [state, results, onUploaded])

  const handleClick = useCallback(async () => {
    if (isLoading) return
    await upload()
  }, [upload, isLoading])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      void handleClick()
    },
    [handleClick],
  )

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)
      const files = Array.from(event.dataTransfer.files)
      await uploadFiles(files)
    },
    [uploadFiles],
  )

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => void handleClick()}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-disabled={isLoading}
        className={`flex items-center gap-3 rounded-lg border border-dashed p-2 text-left transition-colors ${
          isDragging ? 'border-accent-border bg-accent-bg' : 'border-border hover:bg-surface-hover'
        } ${isLoading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-bg text-text-muted">+</div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm text-text-strong">{isLoading ? 'Subiendo…' : 'Subir video'}</span>
          <span className="truncate text-xs text-text-muted">Arrastra aquí o haz click (MP4, WebM)</span>
        </div>
      </div>
      {state === 'error' && (
        <div role="alert" className="flex flex-col gap-1 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {errors.map((error, index) => (
            <span key={`${error}-${index}`}>{ERROR_MESSAGES[error]}</span>
          ))}
        </div>
      )}
    </div>
  )
}
