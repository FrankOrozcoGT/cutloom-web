import type { PublishingPlatform } from '@domain/platform'
import { httpClient } from '@infrastructure/http/client'
import { resolveReturnTo } from '@ui/auth/returnTo'

export function platformCallbackPath(platform: PublishingPlatform): string {
  return `/publishing/${platform}/callback`
}

const PLATFORM_OAUTH_ERROR_CODES = [
  'STATE_MISMATCH',
  'CONSENT_DENIED',
  'YOUTUBE_OAUTH_ERROR',
  'TIKTOK_OAUTH_ERROR',
  'MISSING_AUTHORIZATION_CODE',
  'YOUTUBE_AUTH_FAILED',
  'TIKTOK_AUTH_FAILED',
  'UNEXPECTED_ERROR',
] as const

export type PlatformOAuthErrorCode = (typeof PLATFORM_OAUTH_ERROR_CODES)[number]

// YouTube usaba GOOGLE_OAUTH_ERROR/GOOGLE_AUTH_FAILED antes del contrato genérico por :platform.
// Se toleran durante la transición para no romper si el entorno está a medio migrar.
const LEGACY_YOUTUBE_ERROR_ALIASES: Record<string, PlatformOAuthErrorCode> = {
  GOOGLE_OAUTH_ERROR: 'YOUTUBE_OAUTH_ERROR',
  GOOGLE_AUTH_FAILED: 'YOUTUBE_AUTH_FAILED',
}

/** Único punto de entrada para clasificar el ?error= crudo del redirect del backend — ningún consumidor debe comparar contra el string crudo directamente. */
export function toPlatformOAuthErrorCode(_platform: PublishingPlatform, raw: string): PlatformOAuthErrorCode | null {
  if ((PLATFORM_OAUTH_ERROR_CODES as readonly string[]).includes(raw)) return raw as PlatformOAuthErrorCode
  return LEGACY_YOUTUBE_ERROR_ALIASES[raw] ?? null
}

/**
 * Un redirect de página completa no lleva el header Authorization, así que
 * el frontend pide el destino con fetch (Bearer incluido). ?json=true hace
 * que el backend responda 200 con {url} en vez de 302 — un fetch con
 * redirect:'manual' no sirve para esto: la respuesta queda opaca
 * (status 0, headers vacíos) por spec, sin importar CORS, así que no hay
 * forma de leer el Location de un redirect real. Recién con la URL en el
 * body se navega con window.location.assign. El backend debe reenviar el
 * mismo returnTo como query param al redirigir de vuelta a
 * /publishing/:platform/callback, igual que ya hace para /auth/callback.
 */
export async function startPlatformOAuth(platform: PublishingPlatform, returnTo: string): Promise<void> {
  const validatedReturnTo = resolveReturnTo(returnTo)
  const response = await httpClient.get(
    `/api/publishing/${platform}/auth/start?json=true&returnTo=${encodeURIComponent(validatedReturnTo)}`,
  )
  if (!response.ok) {
    throw new Error(`No se pudo obtener la URL de autorización de ${platform}.`)
  }
  const body = (await response.json()) as { url: string }
  window.location.assign(body.url)
}
