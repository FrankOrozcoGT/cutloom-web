import type { PublishingErrorCode } from '@application/publishing/errors'

export const PUBLISHING_ERROR_MESSAGES: Record<PublishingErrorCode, string> = {
  FEATURE_ACCESS_DENIED: 'Tu plan no incluye esta función premium.',
  INVALID_PAYLOAD: 'La solicitud tiene un formato inválido.',
  INVALID_REQUEST: 'La solicitud tiene un formato inválido.',
  MISSING_SUBTITLES: 'Este video no tiene subtítulos generados todavía. Generá los subtítulos antes de pedir la metadata.',
  NO_PLATFORM_CONNECTION: 'Todavía no conectaste esta cuenta.',
  TOO_MANY_VIDEOS: 'Hay demasiados videos para publicar en un solo envío (máximo 10).',
  VIDEO_FILE_TOO_LARGE: 'Uno de los videos supera el tamaño máximo permitido.',
  METADATA_REVISION_NOT_FOUND: 'No se encontró la metadata generada para uno de los videos.',
  METADATA_REVISION_SOURCE_MISMATCH: 'La metadata generada no corresponde a este video.',
  SCHEDULE_CAPACITY_EXCEEDED: 'Se alcanzó el límite semanal de publicaciones. Probá con otra fecha.',
  VIDEO_UPLOAD_REJECTED: 'La plataforma rechazó el video.',
  PLATFORM_TOKEN_EXPIRED: 'La conexión con la plataforma expiró. Reconectá tu cuenta.',
  RATE_LIMITED: 'Demasiadas solicitudes. Probá de nuevo en unos minutos.',
  ACTIVE_UPLOAD_ALREADY_EXISTS: 'Ya hay una publicación en curso para este video.',
  BULK_UPLOAD_ALREADY_ACTIVE: 'Ya hay una subida en curso para esta serie. Se va a resumir automáticamente.',
  BULK_UPLOAD_NOT_FOUND: 'No hay ninguna subida en curso para esta serie.',
  MISSING_ORGANIZATION: 'No se encontró una organización activa.',
  NETWORK_ERROR: 'Error de red. Verifica tu conexión.',
  UNKNOWN_ERROR: 'Ocurrió un error inesperado.',
}
