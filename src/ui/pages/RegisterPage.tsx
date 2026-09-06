import { useState, type FormEvent } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'
import { AuthLayout } from '@ui/components/AuthLayout'
import { ErrorBanner } from '@ui/components/ErrorBanner'
import { FormField } from '@ui/components/FormField'
import { Button } from '@ui/components/Button'
import { GoogleButton } from '@ui/components/GoogleButton'
import { googleAuthUrl, resolveReturnTo } from '@ui/auth/returnTo'

const MIN_PASSWORD_LENGTH = 8

function errorMessage(code: string): string {
  switch (code) {
    case 'EMAIL_EXISTS':
      return 'Este email ya está registrado. ¿Querés iniciar sesión?'
    case 'EMAIL_EXISTS_GOOGLE':
      return 'Este email está registrado con Google. Iniciá sesión con Google.'
    case 'WEAK_PASSWORD':
      return 'La contraseña no cumple los requisitos mínimos.'
    case 'INVALID_EMAIL':
      return 'El email no es válido.'
    default:
      return 'No se pudo completar el registro. Intentá de nuevo.'
  }
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const returnTo = resolveReturnTo(searchParams.get('returnTo'))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!validateEmail(email)) {
      setError('El email no es válido.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      return
    }

    setIsSubmitting(true)
    const result = await register({ email, password })
    setIsSubmitting(false)
    if (result) {
      setError(errorMessage(result.code))
      return
    }
    navigate(returnTo, { replace: true })
  }

  return (
    <AuthLayout>
      <h1 className="mb-6 text-2xl font-semibold text-text-strong">Crear cuenta</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormField
          id="password"
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        {error && <ErrorBanner as="p">{error}</ErrorBanner>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" />
        o
        <span className="h-px flex-1 bg-border" />
      </div>

      <GoogleButton href={googleAuthUrl(returnTo)} />

      <p className="mt-6 text-center text-sm text-text-muted">
        ¿Ya tenés cuenta?{' '}
        <Link
          to={returnTo === '/projects' ? '/login' : `/login?returnTo=${encodeURIComponent(returnTo)}`}
          className="text-accent hover:text-accent-hover"
        >
          Iniciá sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
