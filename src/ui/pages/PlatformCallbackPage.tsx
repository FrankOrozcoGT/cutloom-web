import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { PublishingPlatform } from '@domain/platform'
import { platformLabel } from '@domain/platform'
import { useAuth } from '@ui/auth/useAuth'
import { OAuthCallbackError, OAuthCallbackPending } from '@ui/components/OAuthCallbackStatus'
import { resolveReturnTo } from '@ui/auth/returnTo'
import { startPlatformOAuth, toPlatformOAuthErrorCode, type PlatformOAuthErrorCode } from '@ui/publishing/oauth'

function errorMessage(platform: PublishingPlatform, code: PlatformOAuthErrorCode | null): string {
  const label = platformLabel(platform)
  switch (code) {
    case 'STATE_MISMATCH':
      return 'La solicitud de conexión expiró o no es válida. Intentá de nuevo.'
    case 'CONSENT_DENIED':
      return `No otorgaste el permiso necesario para conectar ${label}.`
    case 'YOUTUBE_OAUTH_ERROR':
    case 'TIKTOK_OAUTH_ERROR':
      return `${label} reportó un error al autorizar la conexión.`
    case 'MISSING_AUTHORIZATION_CODE':
      return `No se recibió el código de autorización de ${label}.`
    case 'YOUTUBE_AUTH_FAILED':
    case 'TIKTOK_AUTH_FAILED':
      return `No se pudo completar la conexión con ${label}.`
    case 'UNEXPECTED_ERROR':
    case null:
      return `Ocurrió un error inesperado al conectar ${label}.`
  }
}

// No dispara restoreSession(): el backend rota el refresh token en cada uso
// y el AuthProvider ya lo maneja al montar la app (mismo cuidado que
// GoogleCallbackPage). Esta página solo lee la querystring y navega.
export function PlatformCallbackPage() {
  const navigate = useNavigate()
  const { isLoading, refreshEntitlements } = useAuth()
  const [searchParams] = useSearchParams()
  const { platform: rawPlatform } = useParams<{ platform: string }>()
  const platform: PublishingPlatform = rawPlatform === 'tiktok' ? 'tiktok' : 'youtube'
  const connected = searchParams.get(`${platform}Connected`) === 'true'
  const rawErrorCode = searchParams.get('error')
  const returnTo = resolveReturnTo(searchParams.get('returnTo'))

  useEffect(() => {
    if (!connected) return
    // Espera a que el restoreSession() del mount de AuthProvider termine antes
    // de refrescar — si corrieran en paralelo, competirían por rotar el mismo
    // refresh token (single-use en el backend) y uno de los dos recibiría un
    // 401 espurio (mismo cuidado que GoogleCallbackPage).
    if (isLoading) return
    // Refresca {platform}Connected en el estado de auth (mismo patrón que
    // BillingResultPage) sin tocar el refresh token, para que el resto de
    // la app lo sepa apenas se vuelve del OAuth.
    void refreshEntitlements()
    navigate(returnTo, { replace: true })
  }, [connected, isLoading, returnTo, navigate, refreshEntitlements])

  if (rawErrorCode) {
    return (
      <OAuthCallbackError
        title={`No se pudo conectar ${platformLabel(platform)}`}
        message={errorMessage(platform, toPlatformOAuthErrorCode(platform, rawErrorCode))}
        onRetry={() => void startPlatformOAuth(platform, returnTo)}
      />
    )
  }

  return <OAuthCallbackPending message={`Completando conexión con ${platformLabel(platform)}…`} />
}
