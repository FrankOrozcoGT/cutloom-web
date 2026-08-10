import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'
import { AuthLayout } from '@ui/components/AuthLayout'
import { Button } from '@ui/components/Button'

export function GoogleCallbackPage() {
  const { restoreSession } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const queryError = searchParams.get('error')
    if (queryError) {
      setError('No se pudo iniciar sesión con Google.')
      return
    }

    restoreSession().then((result) => {
      if (result) {
        setError('No se pudo completar el inicio de sesión con Google.')
        return
      }
      navigate('/editor', { replace: true })
    })
  }, [searchParams, restoreSession, navigate])

  if (error) {
    return (
      <AuthLayout>
        <p role="alert" className="mb-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
        <Button type="button" onClick={() => navigate('/login', { replace: true })}>
          Volver a intentar
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <p className="text-center text-sm text-text-muted">Completando inicio de sesión…</p>
    </AuthLayout>
  )
}
