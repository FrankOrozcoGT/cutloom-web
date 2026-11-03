import type { ShortsErrorCode } from '@application/shorts/errors'

export const SHORTS_ERROR_MESSAGES: Record<ShortsErrorCode, string> = {
  MISSING_ORGANIZATION: 'No se encontró la organización activa.',
  EMPTY_SEGMENTS: 'No hay subtítulos para procesar. Genera subtítulos primero.',
  EMPTY_CANDIDATES: 'No se detectaron candidatos de shorts.',
  TOO_MANY_CLIPS: 'Se detectaron demasiados candidatos para procesar a la vez.',
  INVALID_AUDIO_SEGMENT: 'Uno de los tramos de audio es inválido.',
  INVALID_PAYLOAD: 'La solicitud tiene un formato inválido.',
  PAYLOAD_TOO_LARGE: 'El contenido a procesar es demasiado pesado. Prueba con menos candidatos o clips más cortos.',
  SHORTS_ACCESS_DENIED: 'Tu plan no incluye esta función premium.',
  SHORTS_LLM_FAILED: 'El análisis de shorts falló. Intenta de nuevo.',
  SUBTITLES_LLM_FAILED: 'La mejora de subtítulos falló. Intenta de nuevo.',
  NETWORK_ERROR: 'Error de red. Verifica tu conexión.',
  UNKNOWN_ERROR: 'Ocurrió un error inesperado.',
}

// POST /api/shorts/score es best-effort: si una parte falla (segunda pasada
// de DeepSeek, SenseVoice en un clip puntual) no rompe la request completa
// — devuelve 200 con un warning. Se traducen los conocidos a texto legible;
// cualquier warning nuevo que el backend agregue se muestra tal cual en vez
// de romper, para no depender de mantener esta lista sincronizada.
const SHORTS_WARNING_MESSAGES: Record<string, string> = {
  scoring_llm_failed_fallback_to_confidence: 'El análisis de score falló — se usó la confianza de detección como score.',
  emotion_analysis_partial: 'El análisis de emoción no pudo completarse para alguno de los clips.',
}

export function describeShortsWarning(warning: string): string {
  return SHORTS_WARNING_MESSAGES[warning] ?? warning
}
