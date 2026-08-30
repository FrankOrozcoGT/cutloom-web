import type { ShortsErrorCode } from '@application/shorts/errors'

export const SHORTS_ERROR_MESSAGES: Record<ShortsErrorCode, string> = {
  MISSING_ORGANIZATION: 'No se encontró la organización activa.',
  EMPTY_SEGMENTS: 'No hay subtítulos para procesar. Genera subtítulos primero.',
  EMPTY_CANDIDATES: 'No se detectaron candidatos de shorts.',
  TOO_MANY_CLIPS: 'Se detectaron demasiados candidatos para procesar a la vez.',
  INVALID_AUDIO_SEGMENT: 'Uno de los tramos de audio es inválido.',
  SHORTS_ACCESS_DENIED: 'Tu plan no incluye esta función premium.',
  SHORTS_LLM_FAILED: 'El análisis de shorts falló. Intenta de nuevo.',
  SUBTITLES_LLM_FAILED: 'La mejora de subtítulos falló. Intenta de nuevo.',
  NETWORK_ERROR: 'Error de red. Verifica tu conexión.',
  UNKNOWN_ERROR: 'Ocurrió un error inesperado.',
}
