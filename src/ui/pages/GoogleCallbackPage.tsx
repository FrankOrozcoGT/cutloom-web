import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'
import { OAuthCallbackError, OAuthCallbackPending } from '@ui/components/OAuthCallbackStatus'
import { resolveReturnTo } from '@ui/auth/returnTo'

function errorMessage(code: string): string {
  switch (code) {
    case 'GOOGLE_AUTH_FAILED':
      return 'No se pudo iniciar sesión con Google. Intentá de nuevo.'
    case 'EMAIL_EXISTS_GOOGLE':
      return 'Este email ya está registrado con Google. Iniciá sesión con Google.'
    case 'EMAIL_EXISTS_LOCAL':
      return 'Este email ya está registrado con contraseña. Iniciá sesión con tu contraseña.'
    default:
      return 'Ocurrió un error inesperado al iniciar sesión con Google.'
  }
}

export function GoogleCallbackPage() {
  // No dispara su propio restoreSession(): AuthProvider ya lo hace una
  // única vez al montar la app. Si esta página llamara restoreSession()
  // también, competiría con ese mismo mount por rotar el refresh token
  // (single-use en el backend) y una de las dos llamadas recibiría un 401
  // espurio. Solo espera a que isLoading termine.
  const { isLoading, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const queryError = searchParams.get('error')
    if (queryError) {
      setError(errorMessage(queryError))
      return
    }

    if (isLoading) return

    if (!isAuthenticated) {
      setError(errorMessage('UNEXPECTED_ERROR'))
      return
    }

    const returnTo = resolveReturnTo(searchParams.get('returnTo'))
    navigate(returnTo, { replace: true })
  }, [searchParams, isLoading, isAuthenticated, navigate])

  if (error) {
    const returnTo = resolveReturnTo(searchParams.get('returnTo'))
    const retryTarget = returnTo === '/projects' ? '/login' : `/login?returnTo=${encodeURIComponent(returnTo)}`
    return (
      <OAuthCallbackError
        title="No se pudo iniciar sesión"
        message={error}
        onRetry={() => navigate(retryTarget, { replace: true })}
      />
    )
  }

  return <OAuthCallbackPending message="Completando inicio de sesión con Google…" />
}
