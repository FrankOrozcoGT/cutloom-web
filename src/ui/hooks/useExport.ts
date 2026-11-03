import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExportWorkerMessage, ExportWorkerResponse } from '@infrastructure/video/export.worker'
import type { ShortFraming } from '@application/shorts/ExtractShortUseCase'

function toFileName(projectName: string | undefined, projectId: string): string {
  const base = projectName?.trim() || projectId
  const sanitized = base.replace(/[/\\?%*:|"<>]/g, '-').trim()
  return (sanitized || projectId) + '.mp4'
}

export const ExportFailureKind = { Known: 'Known', Unknown: 'Unknown' } as const

const RunExportModeKind = { Download: 'Download', Blob: 'Blob' } as const

export type ExportFailure =
  | { kind: typeof ExportFailureKind.Known; code: string }
  | { kind: typeof ExportFailureKind.Unknown; message: string }

function toExportFailure(raw: string): ExportFailure {
  return { kind: ExportFailureKind.Known, code: raw }
}

const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  EMPTY_TIMELINE: 'El timeline no tiene clips para exportar.',
  MISSING_ASSET: 'Un clip hace referencia a un video que ya no existe.',
  UNSUPPORTED_API: 'Este navegador no soporta la exportación de video (WebCodecs).',
  UNSUPPORTED_CODEC: 'El formato solicitado no está disponible en este navegador.',
  MUX_FAILED: 'No se pudo generar el archivo de video.',
  ENCODING_ERROR: 'Ocurrió un error durante la codificación del video.',
  INSUFFICIENT_MEMORY: 'No hay memoria suficiente para exportar. Cierra otras pestañas e intenta de nuevo.',
  STORAGE_ERROR: 'No se pudo leer el timeline o los videos guardados.',
}

/** Mensaje legible para un error conocido — reusado por cualquier consumidor de exportProjectToBlob (ej. usePublish) además de este hook, para no duplicar el switch. */
export function exportErrorCodeMessage(error: string): string {
  return KNOWN_ERROR_MESSAGES[error] ?? `Ocurrió un error inesperado durante la exportación: ${error}`
}

export function useExport() {
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [downloadedFileName, setDownloadedFileName] = useState<string | null>(null)
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

  const getOrCreateWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current
    const worker = new Worker(new URL('@infrastructure/video/export.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    return worker
  }, [])

  type RunExportMode =
    | { kind: typeof RunExportModeKind.Download }
    | { kind: typeof RunExportModeKind.Blob; resolve: (result: { ok: true; blob: Blob } | { ok: false; error: ExportFailure }) => void }

  const runExport = useCallback(
    (
      projectId: string,
      projectName: string | undefined,
      range: { startMs: number; endMs: number } | undefined,
      framing: ShortFraming | undefined,
      mode: RunExportMode,
    ) => {
      const worker = getOrCreateWorker()

      setExporting(true)
      setProgress(0)
      setError(null)
      setCompleted(false)
      setDownloadedFileName(null)

      worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
        const message = event.data

        if (message.type === 'error') {
          if (message.error !== 'ABORTED') {
            console.error('Export falló:', message.error)
          }
          setError(exportErrorCodeMessage(message.error))
          setExporting(false)
          if (mode.kind === RunExportModeKind.Blob) {
            mode.resolve({ ok: false, error: toExportFailure(message.error) })
          }
          return
        }

        if (mode.kind === RunExportModeKind.Blob) {
          setProgress(100)
          setExporting(false)
          setCompleted(true)
          mode.resolve({ ok: true, blob: message.blob })
          return
        }

        const url = URL.createObjectURL(message.blob)
        const fileName = toFileName(projectName, projectId)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        setProgress(100)
        setExporting(false)
        setCompleted(true)
        setDownloadedFileName(fileName)
      }

      worker.onerror = (event) => {
        console.error('Export worker falló:', event.message)
        setError('Ocurrió un error inesperado durante la exportación.')
        setExporting(false)
        worker.terminate()
        workerRef.current = null
        if (mode.kind === RunExportModeKind.Blob) {
          mode.resolve({ ok: false, error: { kind: ExportFailureKind.Unknown, message: event.message } })
        }
      }

      const request: ExportWorkerMessage = { type: 'export', projectId, range, framing }
      worker.postMessage(request)
    },
    [getOrCreateWorker],
  )

  const exportProject = useCallback(
    (projectId: string, projectName?: string, range?: { startMs: number; endMs: number }, framing?: ShortFraming) => {
      runExport(projectId, projectName, range, framing, { kind: RunExportModeKind.Download })
    },
    [runExport],
  )

  const exportProjectToBlob = useCallback(
    (
      projectId: string,
      projectName?: string,
      range?: { startMs: number; endMs: number },
      framing?: ShortFraming,
    ): Promise<{ ok: true; blob: Blob } | { ok: false; error: ExportFailure }> => {
      return new Promise((resolve) => {
        runExport(projectId, projectName, range, framing, { kind: RunExportModeKind.Blob, resolve })
      })
    },
    [runExport],
  )

  return {
    exporting,
    progress,
    error,
    completed,
    downloadedFileName,
    exportProject,
    exportProjectToBlob,
  }
}
