import type { AuthCredentials, CurrentUser } from '@domain/auth'
import { err, type Result } from '@application/result'
import { AuthError } from './errors'
import type { AuthApi, AuthState } from './ports'

/**
 * Orquesta el ciclo de vida completo de la sesión: login, register, logout,
 * restaurar sesión al cargar la app, y refrescar entitlements/plan sin
 * volver a tocar el refresh token. Único lugar que decide "qué hacer con el
 * token" tras cada operación de auth — AuthContext (UI) solo aplica el
 * CurrentUser resultante a su estado de React, no reimplementa este flujo.
 */
export class AuthUseCase {
  private readonly api: AuthApi
  private readonly state: AuthState

  constructor(api: AuthApi, state: AuthState) {
    this.api = api
    this.state = state
  }

  /** Único lugar que consulta /auth/me y deja el access token vigente en AuthState — login, register, restoreSession y refreshEntitlements convergen acá en vez de repetir el paso. */
  private async applySession(accessToken: string): Promise<Result<CurrentUser, AuthError>> {
    this.state.setAccessToken(accessToken)
    return this.api.getCurrentUser(accessToken)
  }

  async login(credentials: AuthCredentials): Promise<Result<CurrentUser, AuthError>> {
    const result = await this.api.login(credentials)
    if (!result.ok) return err(result.error)
    return this.applySession(result.value.accessToken)
  }

  async register(credentials: AuthCredentials): Promise<Result<CurrentUser, AuthError>> {
    const result = await this.api.register(credentials)
    if (!result.ok) return err(result.error)
    return this.applySession(result.value.accessToken)
  }

  async logout(): Promise<void> {
    await this.api.logout()
    this.state.setAccessToken(null)
  }

  // Único disparador de todo el flujo de autenticación al cargar la app.
  // Ninguna otra página debe llamar restoreSession() ni tocar el refresh
  // token por su cuenta — AuthState.refreshAccessToken() ya deduplica
  // llamadas concurrentes, pero eso no evita que dos *disparadores*
  // distintos (dos useEffect de mount) inicien el flujo al mismo tiempo. El
  // backend rota el refresh token en cada uso, así que un segundo
  // disparador siempre pierde con 401 espurio. Páginas que necesiten la
  // sesión lista deben esperar isLoading en AuthContext, no volver a invocar
  // esto.
  async restoreSession(): Promise<Result<CurrentUser, AuthError>> {
    const refreshed = await this.state.refreshAccessToken()
    if (!refreshed) return err(new AuthError('INVALID_TOKEN', 'No se pudo restaurar la sesión.'))
    return this.applySession(refreshed.accessToken)
  }

  // Para refrescar entitlements/plan (ej. reintentos de BillingResultPage
  // esperando el webhook) sin volver a tocar el refresh token — usa el
  // access token ya vigente en AuthState, nunca dispara otro refresh.
  async refreshEntitlements(): Promise<Result<CurrentUser, AuthError> | null> {
    const token = this.state.getAccessToken()
    if (!token) return null
    return this.applySession(token)
  }

  onSessionExpired(handler: () => void): () => void {
    this.state.setSessionExpiredHandler(handler)
    return () => this.state.setSessionExpiredHandler(null)
  }
}
