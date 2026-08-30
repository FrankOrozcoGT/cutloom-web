const DEFAULT_RETURN_TO = '/projects'

/**
 * Valida que returnTo sea una ruta interna antes de usarla para navegar o
 * redirigir — nunca debe aceptar una URL absoluta ni "//host" (protocol-
 * relative), que un link armado por un tercero podría usar para mandar al
 * usuario, ya autenticado, a un sitio externo (open redirect).
 */
export function resolveReturnTo(raw: string | null): string {
  if (!raw) return DEFAULT_RETURN_TO
  if (!raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_RETURN_TO
  return raw
}

const GOOGLE_LOGIN_BASE_URL = `${import.meta.env.VITE_API_URL}/api/auth/google/start`

/** El backend debe reenviar este mismo valor como query param al redirigir de vuelta a /auth/callback. */
export function googleAuthUrl(returnTo: string): string {
  return `${GOOGLE_LOGIN_BASE_URL}?returnTo=${encodeURIComponent(returnTo)}`
}
