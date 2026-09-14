import type { ReactNode } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'
import { FullscreenLoader } from '@ui/components/FullscreenLoader'
import { LoginPage } from '@ui/pages/LoginPage'
import { RegisterPage } from '@ui/pages/RegisterPage'
import { GoogleCallbackPage } from '@ui/pages/GoogleCallbackPage'
import { YouTubeCallbackPage } from '@ui/pages/YouTubeCallbackPage'
import { EditorPage } from '@ui/pages/EditorPage'
import { ProjectsPage } from '@ui/pages/ProjectsPage'
import { ShortsPage } from '@ui/pages/ShortsPage'
import { PublishingPage } from '@ui/pages/PublishingPage'
import { ProfilePage } from '@ui/pages/ProfilePage'
import { LandingPage } from '@ui/pages/LandingPage'
import { BillingPage } from '@ui/pages/BillingPage'
import { CreditsPage } from '@ui/pages/CreditsPage'
import { BillingResultPage } from '@ui/pages/BillingResultPage'
import { CreditsResultPage } from '@ui/pages/CreditsResultPage'
import { DonationResultPage } from '@ui/pages/DonationResultPage'
import { AppLayout } from '@ui/layout/AppLayout'
import { ProtectedRoute } from '@ui/components/ProtectedRoute'

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <FullscreenLoader />
  }

  if (isAuthenticated) {
    return <Navigate to="/projects" replace />
  }

  return <>{children}</>
}

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/projects/:projectId', element: <EditorPage /> },
      { path: '/projects/:projectId/shorts', element: <ShortsPage /> },
      { path: '/projects/:projectId/publish', element: <PublishingPage /> },
      { path: '/billing', element: <BillingPage /> },
      {
        path: '/billing/credits',
        element: (
          <ProtectedRoute>
            <CreditsPage />
          </ProtectedRoute>
        ),
      },
      { path: '/billing/success', element: <BillingResultPage result="success" /> },
      { path: '/billing/cancel', element: <BillingResultPage result="cancel" /> },
      { path: '/credits/success', element: <CreditsResultPage result="success" /> },
      { path: '/credits/cancel', element: <CreditsResultPage result="cancel" /> },
      { path: '/donate/success', element: <DonationResultPage result="success" /> },
      { path: '/donate/cancel', element: <DonationResultPage result="cancel" /> },
    ],
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
    path: '/publishing/youtube/callback',
    element: <YouTubeCallbackPage />,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
