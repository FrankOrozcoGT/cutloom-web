import type { PublishingErrorCode } from '@application/publishing/errors'

export const PUBLISHING_ERROR_MESSAGES: Record<PublishingErrorCode, string> = {
  FEATURE_ACCESS_DENIED: 'Tu plan no incluye esta función premium.',
  INVALID_PAYLOAD: 'La solicitud tiene un formato inválido.',
  MISSING_TOPIC: 'No se pudo inferir el tema del video. Escribí un tema o generá los subtítulos/shorts primero.',
  NO_YOUTUBE_CONNECTION: 'Todavía no conectaste tu cuenta de YouTube.',
  TOO_MANY_VIDEOS: 'Hay demasiados videos para publicar en un solo envío (máximo 10).',
  VIDEO_FILE_TOO_LARGE: 'Uno de los videos supera el tamaño máximo permitido.',
  METADATA_REVISION_NOT_FOUND: 'No se encontró la metadata generada para uno de los videos.',
  METADATA_REVISION_SOURCE_MISMATCH: 'La metadata generada no corresponde a este video.',
  SCHEDULE_CAPACITY_EXCEEDED: 'Se alcanzó el límite semanal de publicaciones. Probá con otra fecha.',
  NETWORK_ERROR: 'Error de red. Verifica tu conexión.',
  UNKNOWN_ERROR: 'Ocurrió un error inesperado.',
}
