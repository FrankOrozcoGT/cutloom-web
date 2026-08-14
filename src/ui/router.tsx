import type { ReactNode } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'
import { FullscreenLoader } from '@ui/components/FullscreenLoader'
import { LoginPage } from '@ui/pages/LoginPage'
import { RegisterPage } from '@ui/pages/RegisterPage'
import { GoogleCallbackPage } from '@ui/pages/GoogleCallbackPage'
import { EditorPage } from '@ui/pages/EditorPage'
import { ProjectsPage } from '@ui/pages/ProjectsPage'

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <FullscreenLoader />
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

const router = createBrowserRouter([
  {
    // TODO: volver a envolver con <ProtectedRoute> cuando el login sea
    // requerido para usar la app. Por ahora la lista de proyectos es la
    // pantalla principal y no depende de autenticación.
    path: '/',
    element: <ProjectsPage />,
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
    path: '/projects/:projectId',
    element: <EditorPage />,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
