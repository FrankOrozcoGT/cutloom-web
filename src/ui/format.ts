/** Formatea una duración en milisegundos como "m:ss", redondeando al segundo más cercano. */
export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
