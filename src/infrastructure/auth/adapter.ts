import type { AuthCredentials, AuthSession, CurrentUser } from '@domain/auth'
import type { AuthApi } from '@application/auth/ports'
import { AuthError } from '@application/auth/errors'
import { err, ok, type Result } from '@application/result'
import type { HttpClient } from '@infrastructure/http/client'
import { mapAuthError, mapAuthSession, mapCurrentUser, type CurrentUserDto } from './mappers'

export class AuthApiAdapter implements AuthApi {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async register(credentials: AuthCredentials): Promise<Result<AuthSession, AuthError>> {
    const response = await this.http.post('/api/auth/register', credentials)
    return this.handleSessionResponse(response)
  }

  async login(credentials: AuthCredentials): Promise<Result<AuthSession, AuthError>> {
    const response = await this.http.post('/api/auth/login', credentials)
    return this.handleSessionResponse(response)
  }

  async logout(): Promise<Result<void, AuthError>> {
    const response = await this.http.post('/api/auth/logout')
    if (!response.ok && response.status !== 204) {
      const error = await this.parseError(response)
      return err(error)
    }
    return ok(undefined)
  }

  async getCurrentUser(accessToken: string): Promise<Result<CurrentUser, AuthError>> {
    const response = await this.http.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) {
      const error = await this.parseError(response)
      return err(error)
    }
    const body = (await response.json()) as CurrentUserDto
    return ok(mapCurrentUser(body))
  }

  private async handleSessionResponse(response: Response): Promise<Result<AuthSession, AuthError>> {
    if (!response.ok) {
      const error = await this.parseError(response)
      return err(error)
    }
    const body = await response.json()
    return ok(mapAuthSession(body))
  }

  private async parseError(response: Response): Promise<AuthError> {
    try {
      const body = (await response.json()) as { error?: string; message?: string }
      return mapAuthError(body.error ?? 'UNKNOWN_ERROR', body.message)
    } catch {
      return mapAuthError('UNKNOWN_ERROR')
    }
  }
}
