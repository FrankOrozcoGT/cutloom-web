import type { ReactNode } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'
import { ProtectedRoute } from '@ui/components/ProtectedRoute'
import { FullscreenLoader } from '@ui/components/FullscreenLoader'
import { LoginPage } from '@ui/pages/LoginPage'
import { RegisterPage } from '@ui/pages/RegisterPage'
import { GoogleCallbackPage } from '@ui/pages/GoogleCallbackPage'
import { EditorPage } from '@ui/pages/EditorPage'

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <FullscreenLoader />
  }

  if (isAuthenticated) {
    return <Navigate to="/editor" replace />
  }

  return <>{children}</>
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/login',
    element: (
      <PublicOnlyRoute>
        <LoginPage />
      </PublicOnlyRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <PublicOnlyRoute>
        <RegisterPage />
      </PublicOnlyRoute>
    ),
  },
  {
    path: '/auth/callback',
    element: <GoogleCallbackPage />,
  },
  {
    path: '/editor',
    element: (
      <ProtectedRoute>
        <EditorPage />
      </ProtectedRoute>
    ),
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
