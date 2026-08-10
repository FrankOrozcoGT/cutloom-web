import { createContext } from 'react'
import type { AuthCredentials, User } from '@domain/auth'
import type { AuthError } from '@application/auth/errors'

export interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: AuthCredentials) => Promise<AuthError | null>
  register: (credentials: AuthCredentials) => Promise<AuthError | null>
  restoreSession: () => Promise<AuthError | null>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
