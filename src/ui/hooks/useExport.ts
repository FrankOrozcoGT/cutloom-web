import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExportError, ExportOptions, ExportPhase } from '@application/video/exportTypes'
import type { ExportWorkerMessage, ExportWorkerResponse } from '@infrastructure/video/export.worker'

const PHASE_LABELS: Record<ExportPhase, string> = {
  loading: 'Cargando timeline…',
  decoding: 'Decodificando y codificando…',
  encoding: 'Codificando video…',
  muxing: 'Generando archivo…',
  done: 'Exportación completada',
}

const DEFAULT_OPTIONS: ExportOptions = {
  format: 'video/webm',
  fps: 30,
  width: 1280,
  height: 720,
}

const ALTERNATIVE_FORMAT: Record<ExportOptions['format'], ExportOptions['format']> = {
  'video/mp4': 'video/webm',
  'video/webm': 'video/mp4',
}

function toFileName(projectName: string | undefined, projectId: string): string {
  const base = projectName?.trim() || projectId
  const sanitized = base.replace(/[/\\?%*:|"<>]/g, '-').trim()
  return sanitized || projectId
}

const EXPORT_ERROR_CODES: readonly ExportError[] = [
  'EMPTY_TIMELINE',
  'MISSING_ASSET',
  'UNSUPPORTED_API',
  'UNSUPPORTED_CODEC',
  'MUX_FAILED',
  'ENCODING_ERROR',
  'INSUFFICIENT_MEMORY',
  'STORAGE_ERROR',
  'ABORTED',
]

function isExportError(value: string): value is ExportError {
  return (EXPORT_ERROR_CODES as string[]).includes(value)
}

function errorMessage(error: string, options: ExportOptions, alreadyRetried: boolean): string {
  if (!isExportError(error)) {
    return `Ocurrió un error inesperado durante la exportación: ${error}`
  }
  switch (error) {
    case 'EMPTY_TIMELINE':
      return 'El timeline no tiene clips para exportar.'
    case 'MISSING_ASSET':
      return 'Un clip hace referencia a un video que ya no existe.'
    case 'UNSUPPORTED_API':
      return 'Este navegador no soporta la exportación de video (WebCodecs).'
    case 'UNSUPPORTED_CODEC': {
      // Si ya se reintentó con el formato alternativo (ver runExport) y
      // también falló, no queda un tercer formato que sugerir — options acá
      // ya ES el fallback, así que ALTERNATIVE_FORMAT[options.format]
      // apuntaría de vuelta al formato original ya descartado.
      if (alreadyRetried) {
        return 'Este navegador no soporta ningún formato de video disponible para exportar.'
      }
      const extension = ALTERNATIVE_FORMAT[options.format] === 'video/mp4' ? 'MP4' : 'WebM'
      return `El formato solicitado no está disponible en este navegador. Prueba exportar en ${extension}.`
    }
    case 'MUX_FAILED':
      return 'No se pudo generar el archivo de video.'
    case 'ENCODING_ERROR':
      return 'Ocurrió un error durante la codificación del video. Intenta reducir la resolución.'
    case 'INSUFFICIENT_MEMORY':
      return 'No hay memoria suficiente para exportar. Cierra otras pestañas o reduce la resolución e intenta de nuevo.'
    case 'STORAGE_ERROR':
      return 'No se pudo leer el timeline o los videos guardados.'
    case 'ABORTED':
      return 'Exportación cancelada.'
  }
}

export function useExport() {
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phaseLabel, setPhaseLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [downloadedFileName, setDownloadedFileName] = useState<string | null>(null)
  const [aborting, setAborting] = useState(false)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    if (!exporting) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [exporting])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const runExport = useCallback(
    (
      projectId: string,
      projectName: string | undefined,
      options: ExportOptions,
      range: { startMs: number; endMs: number } | undefined,
      cropOffsetX: number | undefined,
      isRetry: boolean,
    ) => {
      const worker = new Worker(new URL('@infrastructure/video/export.worker.ts', import.meta.url), {
        type: 'module',
      })
      workerRef.current = worker

      setExporting(true)
      setProgress(0)
      setPhaseLabel(PHASE_LABELS.loading)
      setError(null)
      setCompleted(false)
      setDownloadedFileName(null)
      setAborting(false)

      worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
        const message = event.data

        if (message.type === 'progress') {
          setPhaseLabel(PHASE_LABELS[message.event.phase])
          if (message.event.totalSegments > 0) {
            setProgress(Math.round((message.event.completedSegments / message.event.totalSegments) * 100))
          }
          return
        }

        if (message.type === 'error') {
          // El formato pedido puede no tener codec de audio soportado en este
          // navegador (ej. AAC no existe en WebCodecs para Chromium/Linux) —
          // un solo reintento automático con el formato alternativo evita que
          // el usuario tenga que darse cuenta y reintentar a mano.
          if (message.error === 'UNSUPPORTED_CODEC' && !isRetry) {
            worker.terminate()
            workerRef.current = null
            const fallbackOptions = { ...options, format: ALTERNATIVE_FORMAT[options.format] }
            runExport(projectId, projectName, fallbackOptions, range, cropOffsetX, true)
            return
          }
          if (message.error !== 'ABORTED') {
            console.error('Export falló:', message.error)
          }
          setError(errorMessage(message.error, options, isRetry))
          setExporting(false)
          setPhaseLabel('')
          setAborting(false)
          worker.terminate()
          workerRef.current = null
          return
        }

        const url = URL.createObjectURL(message.blob)
        const extension = options.format === 'video/mp4' ? 'mp4' : 'webm'
        const fileName = `${toFileName(projectName, projectId)}.${extension}`
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        setProgress(100)
        setPhaseLabel('')
        setExporting(false)
        setCompleted(true)
        setDownloadedFileName(fileName)
        worker.terminate()
        workerRef.current = null
      }

      worker.onerror = (event) => {
        console.error('Export worker falló:', event.message)
        setError('Ocurrió un error inesperado durante la exportación.')
        setExporting(false)
        setPhaseLabel('')
        setAborting(false)
        worker.terminate()
        workerRef.current = null
      }

      const request: ExportWorkerMessage = { type: 'export', projectId, options, range, cropOffsetX }
      worker.postMessage(request)
    },
    [],
  )

  const exportProject = useCallback(
    (
      projectId: string,
      projectName?: string,
      options: ExportOptions = DEFAULT_OPTIONS,
      range?: { startMs: number; endMs: number },
      cropOffsetX?: number,
    ) => {
      runExport(projectId, projectName, options, range, cropOffsetX, false)
    },
    [runExport],
  )

  const abortExport = useCallback(() => {
    if (!workerRef.current) return
    setAborting(true)
    const message: ExportWorkerMessage = { type: 'abort' }
    workerRef.current.postMessage(message)
  }, [])

  return {
    exporting,
    progress,
    phaseLabel,
    error,
    completed,
    downloadedFileName,
    aborting,
    exportProject,
    abortExport,
  }
}
