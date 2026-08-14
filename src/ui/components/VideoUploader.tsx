import { useCallback, useEffect, useState, type DragEvent } from 'react'
import type { UploadError, VideoUploadResult } from '@domain/video'
import { Button } from '@ui/components/Button'
import { useVideoUpload, type UploadState } from '@ui/hooks/useVideoUpload'

const ERROR_MESSAGES: Record<UploadError, string> = {
  UNSUPPORTED_FORMAT: 'Formato no soportado. Usa MP4 o WebM.',
  FILE_TOO_LARGE: 'Archivo demasiado grande. Máximo 2GB.',
  STORAGE_FULL: 'No hay espacio suficiente en el navegador para guardar el video.',
  THUMBNAIL_FAILED: 'No se pudo generar el thumbnail del video.',
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
    await upload()
  }, [upload])

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
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col items-center gap-4 rounded-lg border border-dashed p-10 text-center transition-colors ${
        isDragging ? 'border-accent-border bg-accent-bg' : 'border-border'
      }`}
    >
      <p className="text-sm text-text-muted">Arrastra un video MP4 o WebM, o</p>
      <Button onClick={handleClick} disabled={isLoading} className="w-auto">
        {isLoading ? 'Subiendo…' : 'Subir video'}
      </Button>
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
