import { createContext } from 'react'
import type { AuthCredentials, User, UserEntitlement } from '@domain/auth'
import type { AuthError } from '@application/auth/errors'

export interface AuthContextValue {
  user: User | null
  organizationId: string | null
  entitlements: UserEntitlement[]
  youtubeConnected: boolean
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: AuthCredentials) => Promise<AuthError | null>
  register: (credentials: AuthCredentials) => Promise<AuthError | null>
  logout: () => Promise<void>
  hasActiveFeature: (feature: string) => boolean
  // Refresca entitlements/plan usando el access token ya vigente — no toca
  // el refresh token. El único disparador del flujo de autenticación
  // completo (refresh + /auth/me) es el mount de AuthProvider; ninguna
  // página debe iniciarlo de nuevo, por eso no se expone restoreSession.
  refreshEntitlements: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
