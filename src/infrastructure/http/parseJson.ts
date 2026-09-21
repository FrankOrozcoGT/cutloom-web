import { z } from 'zod'

/**
 * Único punto de parseo+validación de un body JSON de respuesta HTTP contra
 * un schema zod — reemplaza el patrón `(await response.json()) as XxxDto`
 * repetido en los adapters, que solo se lo prometía al compilador sin
 * verificar la forma real en runtime. Si el backend cambia de forma o
 * responde algo inesperado, esto falla temprano y explícito en el punto de
 * entrada, en vez de dejar pasar un objeto corrupto que recién explota más
 * adelante en el mapper o en la UI.
 */
export async function parseJson<Schema extends z.ZodType>(response: Response, schema: Schema): Promise<z.infer<Schema>> {
  const raw: unknown = await response.json()
  return schema.parse(raw)
}

const errorBodySchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
})

/**
 * Parseo best-effort del body de error de cualquier endpoint del backend —
 * mismo shape `{ error?, message? }` en todos los dominios (auth, billing,
 * shorts, publishing). Si el body no es JSON válido o no matchea ese shape,
 * devuelve null en vez de lanzar: un error HTTP con body vacío/no-JSON
 * sigue siendo un error real que el caller debe mapear a su UNKNOWN_ERROR
 * de dominio, no una falla del propio parseo de error.
 */
export async function parseErrorBody(response: Response): Promise<{ error?: string; message?: string } | null> {
  try {
    const raw: unknown = await response.json()
    const result = errorBodySchema.safeParse(raw)
    return result.success ? result.data : null
  } catch {
    return null
  }
}
