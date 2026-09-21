import type { AuthCredentials, AuthSession, CurrentUser } from '@domain/auth'
import type { AuthApi } from '@application/auth/ports'
import { AuthError } from '@application/auth/errors'
import { err, ok, type Result } from '@application/result'
import type { HttpClient } from '@infrastructure/http/client'
import { parseErrorBody, parseJson } from '@infrastructure/http/parseJson'
import { authSessionSchema, currentUserSchema, mapAuthError, mapAuthSession, mapCurrentUser } from './mappers'

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
    const body = await parseJson(response, currentUserSchema)
    return ok(mapCurrentUser(body))
  }

  private async handleSessionResponse(response: Response): Promise<Result<AuthSession, AuthError>> {
    if (!response.ok) {
      const error = await this.parseError(response)
      return err(error)
    }
    const body = await parseJson(response, authSessionSchema)
    return ok(mapAuthSession(body))
  }

  private async parseError(response: Response): Promise<AuthError> {
    const body = await parseErrorBody(response)
    return mapAuthError(body?.error ?? 'UNKNOWN_ERROR', body?.message)
  }
}
