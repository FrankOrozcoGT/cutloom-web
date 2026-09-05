/** Formatea un error desconocido (catch) para logging: nombre+mensaje si es un Error, o su representación string. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

/**
 * Resuelve un código de error crudo del backend a un código conocido del
 * dominio (o al fallback si no está en la lista), y construye el error de
 * dominio correspondiente — mismo patrón repetido en los mappers de auth,
 * billing y shorts (Set de códigos conocidos + fallback a UNKNOWN_ERROR),
 * ahora en un único lugar para que agregar un código nuevo del backend no
 * dependa de recordar actualizar tres implementaciones idénticas por separado.
 */
export function mapKnownError<Code extends string, E extends Error>(
  knownCodes: readonly Code[],
  buildError: (code: Code, message: string) => E,
  rawCode: string,
  message?: string,
): E {
  const match = knownCodes.find((code) => code === rawCode)
  const resolvedCode = match ?? knownCodes.find((code) => code === 'UNKNOWN_ERROR')
  if (!resolvedCode) {
    throw new Error('mapKnownError: knownCodes debe incluir UNKNOWN_ERROR como fallback')
  }
  return buildError(resolvedCode, message ?? resolvedCode)
}
