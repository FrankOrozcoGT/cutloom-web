import { AuthLayout } from '@ui/components/AuthLayout'
import { Button } from '@ui/components/Button'

interface OAuthCallbackErrorProps {
  title: string
  message: string
  onRetry: () => void
}

/** Estado de error compartido por las páginas de callback OAuth (Google login, conectar YouTube) — mismo layout, solo cambian título/mensaje/acción de reintento. */
export function OAuthCallbackError({ title, message, onRetry }: OAuthCallbackErrorProps) {
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
          <h1 className="text-lg font-semibold text-text-strong">{title}</h1>
          <p role="alert" className="mt-1 text-sm text-text-muted">
            {message}
          </p>
        </div>
        <Button type="button" onClick={onRetry} className="mt-2">
          Volver a intentar
        </Button>
      </div>
    </AuthLayout>
  )
}

export function OAuthCallbackPending({ message }: { message: string }) {
  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-sm text-text-muted">{message}</p>
      </div>
    </AuthLayout>
  )
}
