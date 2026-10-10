import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_EXPORT_OPTIONS,
  fileExtensionFor,
  type ExportError,
  type ExportOptions,
  type ExportPhase,
} from '@application/video/exportTypes'
import type { ExportWorkerMessage, ExportWorkerResponse } from '@infrastructure/video/export.worker'

const PHASE_LABELS: Record<ExportPhase, string> = {
  loading: 'Cargando timeline…',
  decoding: 'Decodificando y codificando…',
  encoding: 'Codificando video…',
  muxing: 'Generando archivo…',
  done: 'Exportación completada',
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

// String literal (no unique symbol): TypeScript no angosta uniones
// discriminadas por symbol de forma consistente (issues #36463/#23135), y la
// comunidad usa string literals derivados de un objeto as const como patrón
// estándar (action types) — mismo objeto-constante, sin el problema de narrowing.
export const ExportFailureKind = { Known: 'Known', Unknown: 'Unknown' } as const

const RunExportModeKind = { Download: 'Download', Blob: 'Blob' } as const

// El worker mezcla códigos conocidos (ExportError) con mensajes libres de
// crasheo real (INIT_FAILED/UNCAUGHT/UNHANDLED_REJECTION, ver export.worker.ts)
// — son dos vocabularios distintos y honestos, no un descuido de tipado.
// ExportFailure preserva esa distinción para quien consuma exportProjectToBlob,
// en vez de degradar todo a un string plano indiferenciado.
export type ExportFailure =
  | { kind: typeof ExportFailureKind.Known; code: ExportError }
  | { kind: typeof ExportFailureKind.Unknown; message: string }

function toExportFailure(raw: string): ExportFailure {
  return isExportError(raw)
    ? { kind: ExportFailureKind.Known, code: raw }
    : { kind: ExportFailureKind.Unknown, message: raw }
}

/** Mensaje legible para un ExportError conocido — reusado por cualquier consumidor de exportProjectToBlob (ej. usePublish) además de este hook, para no duplicar el switch. */
export function exportErrorCodeMessage(error: ExportError): string {
  switch (error) {
    case 'EMPTY_TIMELINE':
      return 'El timeline no tiene clips para exportar.'
    case 'MISSING_ASSET':
      return 'Un clip hace referencia a un video que ya no existe.'
    case 'UNSUPPORTED_API':
      return 'Este navegador no soporta la exportación de video (WebCodecs).'
    case 'UNSUPPORTED_CODEC':
      return 'El formato solicitado no está disponible en este navegador.'
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

/** Mensaje legible para el estado interno del hook — agrega el detalle de reintento de formato y el mensaje libre de crasheo, específicos de este flujo (descarga/export en curso). */
function errorMessage(error: string, options: ExportOptions, alreadyRetried: boolean): string {
  if (!isExportError(error)) {
    return `Ocurrió un error inesperado durante la exportación: ${error}`
  }
  if (error === 'UNSUPPORTED_CODEC') {
    // Si ya se reintentó con el formato alternativo (ver runExport) y también
    // falló, no queda un tercer formato que sugerir — options acá ya ES el
    // fallback, así que ALTERNATIVE_FORMAT[options.format] apuntaría de
    // vuelta al formato original ya descartado.
    if (alreadyRetried) {
      return 'Este navegador no soporta ningún formato de video disponible para exportar.'
    }
    const extension = ALTERNATIVE_FORMAT[options.format] === 'video/mp4' ? 'MP4' : 'WebM'
    return `El formato solicitado no está disponible en este navegador. Prueba exportar en ${extension}.`
  }
  return exportErrorCodeMessage(error)
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

  // Crea el Worker UNA sola vez y lo reutiliza entre exports — antes se creaba y mataba (terminate)
  // en cada llamada a runExport, lo que con un bulk de varios shorts (ver usePublish.publish(), un
  // export secuencial por item) forzaba al navegador a re-descargar y re-ejecutar desde cero todo el
  // árbol de módulos del worker (mediabunny, VideoDecoderAdapter, VideoEncoderAdapter,
  // OffscreenCanvasCompositor, etc.) una vez por cada short exportado. El worker es stateless entre
  // mensajes 'export' (ver export.worker.ts: exportUseCase se construye una sola vez a nivel de
  // módulo, currentAbortController se resetea en cada invocación) — no hay ningún motivo real para
  // no reusarlo. Solo se destruye en el cleanup de desmontaje, o si el worker crashea con un error no
  // controlado (su estado interno queda indeterminado, mejor recrearlo que seguir usándolo).
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
      options: ExportOptions,
      range: { startMs: number; endMs: number } | undefined,
      cropOffsetX: number | undefined,
      isRetry: boolean,
      mode: RunExportMode,
    ) => {
      const worker = getOrCreateWorker()

      setExporting(true)
      setProgress(0)
      setPhaseLabel(PHASE_LABELS.loading)
      setError(null)
      setCompleted(false)
      setDownloadedFileName(null)
      setAborting(false)

      const finishExport = () => {
        setProgress(100)
        setPhaseLabel('')
        setExporting(false)
        setCompleted(true)
      }

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
            // El worker en sí sigue sano (UNSUPPORTED_CODEC es una limitación del navegador, no un
            // estado roto) — se reusa para el reintento con el formato alternativo en vez de matarlo.
            const fallbackOptions = { ...options, format: ALTERNATIVE_FORMAT[options.format] }
            runExport(projectId, projectName, fallbackOptions, range, cropOffsetX, true, mode)
            return
          }
          if (message.error !== 'ABORTED') {
            console.error('Export falló:', message.error)
          }
          setError(errorMessage(message.error, options, isRetry))
          setExporting(false)
          setPhaseLabel('')
          setAborting(false)
          if (mode.kind === RunExportModeKind.Blob) {
            mode.resolve({ ok: false, error: toExportFailure(message.error) })
          }
          return
        }

        if (mode.kind === RunExportModeKind.Blob) {
          finishExport()
          mode.resolve({ ok: true, blob: message.blob })
          return
        }

        const url = URL.createObjectURL(message.blob)
        const fileName = `${toFileName(projectName, projectId)}.${fileExtensionFor(options.format)}`
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        finishExport()
        setDownloadedFileName(fileName)
      }

      worker.onerror = (event) => {
        console.error('Export worker falló:', event.message)
        setError('Ocurrió un error inesperado durante la exportación.')
        setExporting(false)
        setPhaseLabel('')
        setAborting(false)
        worker.terminate()
        workerRef.current = null
        if (mode.kind === RunExportModeKind.Blob) {
          mode.resolve({ ok: false, error: { kind: ExportFailureKind.Unknown, message: event.message } })
        }
      }

      const request: ExportWorkerMessage = { type: 'export', projectId, options, range, cropOffsetX }
      worker.postMessage(request)
    },
    [getOrCreateWorker],
  )

  const exportProject = useCallback(
    (
      projectId: string,
      projectName?: string,
      options: ExportOptions = DEFAULT_EXPORT_OPTIONS,
      range?: { startMs: number; endMs: number },
      cropOffsetX?: number,
    ) => {
      runExport(projectId, projectName, options, range, cropOffsetX, false, { kind: RunExportModeKind.Download })
    },
    [runExport],
  )

  const exportProjectToBlob = useCallback(
    (
      projectId: string,
      projectName?: string,
      options: ExportOptions = DEFAULT_EXPORT_OPTIONS,
      range?: { startMs: number; endMs: number },
      cropOffsetX?: number,
    ): Promise<{ ok: true; blob: Blob } | { ok: false; error: ExportFailure }> => {
      return new Promise((resolve) => {
        runExport(projectId, projectName, options, range, cropOffsetX, false, { kind: RunExportModeKind.Blob, resolve })
      })
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
    exportProjectToBlob,
    abortExport,
  }
}
