import type { AuthCredentials, AuthSession, CurrentUser } from '@domain/auth'
import type { Result } from '@application/result'
import type { AuthError } from './errors'

export interface AuthApi {
  register(credentials: AuthCredentials): Promise<Result<AuthSession, AuthError>>
  login(credentials: AuthCredentials): Promise<Result<AuthSession, AuthError>>
  logout(): Promise<Result<void, AuthError>>
  getCurrentUser(accessToken: string): Promise<Result<CurrentUser, AuthError>>
}

export interface AuthState {
  getAccessToken(): string | null
  setAccessToken(token: string | null): void
  refreshAccessToken(): Promise<{ accessToken: string } | null>
  setSessionExpiredHandler(handler: (() => void) | null): void
}
