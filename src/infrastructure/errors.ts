/** Formatea un error desconocido (catch) para logging: nombre+mensaje si es un Error, o su representación string. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}
