import type { AuthCredentials, User } from '@domain/auth'
import { err, ok, type Result } from '@application/result'
import type { AuthApi, AuthState } from './ports'
import type { AuthError } from './errors'

/** Orquesta login/registro/logout/restauración de sesión contra AuthApi, sin conocer HTTP. */
export class AuthUseCase {
  private readonly api: AuthApi
  private readonly state: AuthState

  constructor(api: AuthApi, state: AuthState) {
    this.api = api
    this.state = state
  }

  async login(credentials: AuthCredentials): Promise<Result<User, AuthError>> {
    const result = await this.api.login(credentials)
    if (!result.ok) return err(result.error)
    this.state.setAccessToken(result.value.accessToken)
    return ok(result.value.user)
  }

  async register(credentials: AuthCredentials): Promise<Result<User, AuthError>> {
    const result = await this.api.register(credentials)
    if (!result.ok) return err(result.error)
    this.state.setAccessToken(result.value.accessToken)
    return ok(result.value.user)
  }

  async logout(): Promise<void> {
    await this.api.logout()
    this.state.setAccessToken(null)
  }

  /** Recupera la sesión al cargar la app (refresh token vía cookie httpOnly). */
  async restoreSession(): Promise<Result<User, AuthError>> {
    const refreshResult = await this.api.refreshToken()
    if (!refreshResult.ok) return err(refreshResult.error)

    this.state.setAccessToken(refreshResult.value.accessToken)
    const userResult = await this.api.getCurrentUser(refreshResult.value.accessToken)
    if (!userResult.ok) return err(userResult.error)

    return ok(userResult.value)
  }
}
