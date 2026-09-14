import { httpClient } from '@infrastructure/http/client'
import { resolveReturnTo } from '@ui/auth/returnTo'

export const YOUTUBE_CALLBACK_PATH = '/publishing/youtube/callback'

const YOUTUBE_OAUTH_ERROR_CODES = [
  'STATE_MISMATCH',
  'CONSENT_DENIED',
  'GOOGLE_OAUTH_ERROR',
  'MISSING_AUTHORIZATION_CODE',
  'YOUTUBE_AUTH_FAILED',
  'UNEXPECTED_ERROR',
] as const

export type YouTubeOAuthErrorCode = (typeof YOUTUBE_OAUTH_ERROR_CODES)[number]

/** Único punto de entrada para clasificar el ?error= crudo del redirect del backend — ningún consumidor debe comparar contra el string crudo directamente. */
export function toYouTubeOAuthErrorCode(raw: string): YouTubeOAuthErrorCode | null {
  return (YOUTUBE_OAUTH_ERROR_CODES as readonly string[]).includes(raw) ? (raw as YouTubeOAuthErrorCode) : null
}

const YOUTUBE_AUTH_START_PATH = '/api/publishing/youtube/auth/start'

/**
 * Un redirect de página completa no lleva el header Authorization, así que
 * el frontend pide el destino con fetch (Bearer incluido). ?json=true hace
 * que el backend responda 200 con {url} en vez de 302 — un fetch con
 * redirect:'manual' no sirve para esto: la respuesta queda opaca
 * (status 0, headers vacíos) por spec, sin importar CORS, así que no hay
 * forma de leer el Location de un redirect real. Recién con la URL en el
 * body se navega con window.location.assign. El backend debe reenviar el
 * mismo returnTo como query param al redirigir de vuelta a
 * /publishing/youtube/callback, igual que ya hace para /auth/callback.
 */
export async function startYouTubeOAuth(returnTo: string): Promise<void> {
  const validatedReturnTo = resolveReturnTo(returnTo)
  const response = await httpClient.get(
    `${YOUTUBE_AUTH_START_PATH}?json=true&returnTo=${encodeURIComponent(validatedReturnTo)}`,
  )
  if (!response.ok) {
    throw new Error('No se pudo obtener la URL de autorización de YouTube.')
  }
  const body = (await response.json()) as { url: string }
  window.location.assign(body.url)
}
