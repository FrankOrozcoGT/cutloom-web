import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'
import { OAuthCallbackError, OAuthCallbackPending } from '@ui/components/OAuthCallbackStatus'
import { resolveReturnTo } from '@ui/auth/returnTo'
import { startYouTubeOAuth, toYouTubeOAuthErrorCode, type YouTubeOAuthErrorCode } from '@ui/publishing/oauth'

function errorMessage(code: YouTubeOAuthErrorCode | null): string {
  switch (code) {
    case 'STATE_MISMATCH':
      return 'La solicitud de conexión expiró o no es válida. Intentá de nuevo.'
    case 'CONSENT_DENIED':
      return 'No otorgaste el permiso necesario para conectar YouTube.'
    case 'GOOGLE_OAUTH_ERROR':
      return 'Google reportó un error al autorizar la conexión.'
    case 'MISSING_AUTHORIZATION_CODE':
      return 'No se recibió el código de autorización de Google.'
    case 'YOUTUBE_AUTH_FAILED':
      return 'No se pudo completar la conexión con YouTube.'
    case 'UNEXPECTED_ERROR':
    case null:
      return 'Ocurrió un error inesperado al conectar YouTube.'
  }
}

// No dispara restoreSession(): el backend rota el refresh token en cada uso
// y el AuthProvider ya lo maneja al montar la app (mismo cuidado que
// GoogleCallbackPage). Esta página solo lee la querystring y navega.
export function YouTubeCallbackPage() {
  const navigate = useNavigate()
  const { refreshEntitlements } = useAuth()
  const [searchParams] = useSearchParams()
  const connected = searchParams.get('youtubeConnected') === 'true'
  const rawErrorCode = searchParams.get('error')
  const returnTo = resolveReturnTo(searchParams.get('returnTo'))

  useEffect(() => {
    if (!connected) return
    // Refresca youtubeConnected en el estado de auth (mismo patrón que
    // BillingResultPage) sin tocar el refresh token, para que el resto de
    // la app lo sepa apenas se vuelve del OAuth.
    void refreshEntitlements()
    navigate(returnTo, { replace: true })
  }, [connected, returnTo, navigate, refreshEntitlements])

  if (rawErrorCode) {
    return (
      <OAuthCallbackError
        title="No se pudo conectar YouTube"
        message={errorMessage(toYouTubeOAuthErrorCode(rawErrorCode))}
        onRetry={() => void startYouTubeOAuth(returnTo)}
      />
    )
  }

  return <OAuthCallbackPending message="Completando conexión con YouTube…" />
}
