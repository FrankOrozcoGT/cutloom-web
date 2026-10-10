import { Upload, type DetailedError } from 'tus-js-client'
import { err, ok, type Result } from '@application/result'
import { httpClient } from '@infrastructure/http/client'

export interface TusUploadParams {
  uploadUrl: string
  file: Blob
  fileName: string
  onProgress: (bytesUploaded: number, bytesTotal: number) => void
}

export type TusUploadError = { kind: 'TusUploadError'; message: string }

/** 4xx nunca se arregla reintentando el mismo request (credenciales inválidas, archivo no encontrado, tamaño rechazado, etc.) — solo 5xx/fallos de red puros (sin originalResponse, ej. el chunk se cortó a mitad de camino) valen la pena reintentar, porque el próximo intento puede transmitirse completo. */
function isRetryableStatus(error: DetailedError): boolean {
  const status = error.originalResponse?.getStatus()
  if (status === undefined) return true // fallo de red puro, sin respuesta del servidor — sí reintentable
  return status >= 500
}

/**
 * tus-js-client manda el archivo COMPLETO en un solo PATCH si no se fija
 * chunkSize (default Infinity) — con un túnel/proxy de por medio (nginx:
 * client_max_body_size default de solo 1MB) eso corta la conexión a mitad
 * del body en cualquier video real, y como no hay chunks más chicos, cada
 * reintento vuelve a mandar el archivo entero desde cero en vez de resumir
 * un pedazo corto. 512KB queda cómodo bajo ese límite default de 1MB (con
 * margen para headers/overhead) y acota la ventana de tiempo en la que un
 * corte de conexión puede arruinar la transferencia en curso.
 */
const CHUNK_SIZE_BYTES = 512 * 1024

/**
 * Sube un archivo vía TUS a una uploadUrl ya creada por el backend (paso 1
 * del bulk-upload) — el backend pre-crea el upload, así que el cliente solo
 * hace los PATCH/HEAD de tus-js-client, nunca el POST inicial. El Bearer
 * token se adjunta a mano porque tus-js-client no pasa por httpClient.
 *
 * Si el navegador se queda haciendo HEAD/OPTIONS en loop sin llegar a emitir
 * nunca un PATCH, es casi siempre CORS: el header Authorization cross-origin
 * dispara un preflight OPTIONS, y si el servidor tus (R2) no responde ese
 * preflight con Access-Control-Allow-Headers: Authorization (y
 * Access-Control-Expose-Headers incluyendo Upload-Offset/Upload-Length), el
 * navegador bloquea la respuesta del HEAD antes de que JS la vea — tus-js-client
 * lo interpreta como fallo de red y reintenta con retryDelays indefinidamente,
 * nunca llega a onError hasta agotar todos los reintentos (si acaso).
 */
export class TusUploadAdapter {
  upload(params: TusUploadParams): Promise<Result<void, TusUploadError>> {
    return new Promise((resolve) => {
      const accessToken = httpClient.getAccessToken()
      const upload = new Upload(params.file, {
        uploadUrl: params.uploadUrl,
        chunkSize: CHUNK_SIZE_BYTES,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        metadata: { filename: params.fileName },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        onError: (error) => {
          console.error('tus upload falló:', params.fileName, error)
          resolve(err({ kind: 'TusUploadError', message: error.message }))
        },
        // Dos condiciones para reintentar, ambas necesarias: (1) el error debe ser de un tipo que
        // tenga sentido reintentar (isRetryableStatus — nunca un 4xx, siempre va a repetirse igual),
        // y (2) no haberse agotado los retryDelays configurados. Forzar `true` siempre (ignorando
        // el tipo de error) dejaba la subida reintentando para siempre ante errores estructurales
        // (ej. 4xx, o un 5xx que el túnel repite igual cada vez) que ningún reintento iba a resolver
        // — el item se quedaba en 'uploading'/'awaiting_result' mudo para siempre, sin que la UI
        // muestre ningún error. Devolver false deja que la librería misma dispare onError.
        onShouldRetry: (error, retryAttempt, options) => {
          const maxRetries = options.retryDelays?.length ?? 0
          const willRetry = isRetryableStatus(error) && retryAttempt < maxRetries
          const status = error.originalResponse?.getStatus()
          console.warn(
            `tus upload ${willRetry ? 'reintentando' : 'no reintentable o agotó los reintentos'} (${retryAttempt + 1}/${maxRetries}, status: ${status ?? 'n/a'}):`,
            params.fileName,
            error.message,
          )
          return willRetry
        },
        onProgress: params.onProgress,
        onSuccess: () => resolve(ok(undefined)),
      })
      upload.start()
    })
  }
}
