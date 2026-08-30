import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'
import { FullscreenLoader } from '@ui/components/FullscreenLoader'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullscreenLoader />
  }

  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(location.pathname)
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />
  }

  return <>{children}</>
}
