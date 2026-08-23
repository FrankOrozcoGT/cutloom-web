import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AuthCredentials, User, UserEntitlement } from '@domain/auth'
import { AuthError } from '@application/auth/errors'
import { AuthApiAdapter } from '@infrastructure/auth/adapter'
import { httpClient } from '@infrastructure/http/client'
import { AuthContext, type AuthContextValue } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [entitlements, setEntitlements] = useState<UserEntitlement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const authApi = useRef(new AuthApiAdapter(httpClient)).current

  const clearSession = useCallback(() => {
    setUser(null)
    setOrganizationId(null)
    setEntitlements([])
  }, [])

  // Único lugar que consulta /auth/me y aplica el resultado al estado.
  // Todo lo que necesite "cargar los datos del usuario para un token que ya
  // tengo" converge acá — login, register, restoreSession y el refresh
  // manual de entitlements comparten este mismo paso, en vez de repetirlo.
  const applySession = useCallback(
    async (accessToken: string) => {
      httpClient.setAccessToken(accessToken)
      const userResult = await authApi.getCurrentUser(accessToken)
      if (!userResult.ok) return userResult.error

      setUser(userResult.value.user)
      setOrganizationId(userResult.value.organizationId)
      setEntitlements(userResult.value.entitlements)
      return null
    },
    [authApi],
  )

  // Único disparador de todo el flujo de autenticación al cargar la app.
  // Ninguna otra página debe llamar restoreSession() ni tocar el refresh
  // token por su cuenta — httpClient.refreshAccessToken() ya deduplica
  // llamadas concurrentes, pero eso no evita que dos *disparadores*
  // distintos (dos useEffect de mount) inicien el flujo al mismo tiempo.
  // El backend rota el refresh token en cada uso, así que un segundo
  // disparador siempre pierde con 401 espurio. Páginas que necesiten la
  // sesión lista deben esperar `isLoading`, no volver a invocar esto.
  const restoreSession = useCallback(async () => {
    const refreshed = await httpClient.refreshAccessToken()
    if (!refreshed) return new AuthError('INVALID_TOKEN', 'No se pudo restaurar la sesión.')
    return applySession(refreshed.accessToken)
  }, [applySession])

  useEffect(() => {
    httpClient.setSessionExpiredHandler(() => clearSession())
    return () => httpClient.setSessionExpiredHandler(null)
  }, [clearSession])

  useEffect(() => {
    void restoreSession().finally(() => setIsLoading(false))
  }, [restoreSession])

  const login = useCallback(
    async (credentials: AuthCredentials) => {
      const result = await authApi.login(credentials)
      if (!result.ok) return result.error
      return applySession(result.value.accessToken)
    },
    [authApi, applySession],
  )

  const register = useCallback(
    async (credentials: AuthCredentials) => {
      const result = await authApi.register(credentials)
      if (!result.ok) return result.error
      return applySession(result.value.accessToken)
    },
    [authApi, applySession],
  )

  const logout = useCallback(async () => {
    await authApi.logout()
    httpClient.setAccessToken(null)
    clearSession()
  }, [authApi, clearSession])

  // Para refrescar entitlements/plan (ej. reintentos de BillingResultPage
  // esperando el webhook) sin volver a tocar el refresh token — usa el
  // access token ya vigente en httpClient, nunca dispara otro refresh.
  const refreshEntitlements = useCallback(async () => {
    const token = httpClient.getAccessToken()
    if (!token) return
    await applySession(token)
  }, [applySession])

  const hasActiveFeature = useCallback(
    (feature: string) => entitlements.some((e) => e.feature === feature && e.active),
    [entitlements],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      organizationId,
      entitlements,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
      hasActiveFeature,
      refreshEntitlements,
    }),
    [user, organizationId, entitlements, isLoading, login, register, logout, hasActiveFeature, refreshEntitlements],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
