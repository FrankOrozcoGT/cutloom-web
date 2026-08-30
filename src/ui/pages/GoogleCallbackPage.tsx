import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'
import { AuthLayout } from '@ui/components/AuthLayout'
import { Button } from '@ui/components/Button'
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
      <AuthLayout>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 text-danger">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M12 8v5M12 16h.01" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-strong">No se pudo iniciar sesión</h1>
            <p role="alert" className="mt-1 text-sm text-text-muted">
              {error}
            </p>
          </div>
          <Button type="button" onClick={() => navigate(retryTarget, { replace: true })} className="mt-2">
            Volver a intentar
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-sm text-text-muted">Completando inicio de sesión con Google…</p>
      </div>
    </AuthLayout>
  )
}
