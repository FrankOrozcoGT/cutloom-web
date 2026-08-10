import type { AuthCredentials, AuthSession, User } from '@domain/auth'
import type { Result } from '@application/result'
import type { AuthError } from './errors'

export interface AuthApi {
  register(credentials: AuthCredentials): Promise<Result<AuthSession, AuthError>>
  login(credentials: AuthCredentials): Promise<Result<AuthSession, AuthError>>
  logout(): Promise<Result<void, AuthError>>
  refreshToken(): Promise<Result<{ accessToken: string }, AuthError>>
  getCurrentUser(accessToken: string): Promise<Result<User, AuthError>>
}

export interface AuthState {
  getAccessToken(): string | null
  setAccessToken(token: string | null): void
}
