/** Formatea una duración en milisegundos como "m:ss", redondeando al segundo más cercano. */
export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Formatea una posición/duración del timeline con el mismo criterio que la
 * regla (TimeRuler): segundos con un decimal bajo el minuto ("12.5s") y
 * "m:ss" a partir de ahí ("1:15"), para que chips y regla se lean igual.
 */
export function formatTimelineMs(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return formatDurationMs(ms)
}
