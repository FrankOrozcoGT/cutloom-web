import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AuthCredentials, CurrentUser, User, UserEntitlement } from '@domain/auth'
import type { Result } from '@application/result'
import { AuthUseCase } from '@application/auth/AuthUseCase'
import type { AuthError } from '@application/auth/errors'
import { AuthApiAdapter } from '@infrastructure/auth/adapter'
import { httpClient } from '@infrastructure/http/client'
import { AuthContext, type AuthContextValue } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [entitlements, setEntitlements] = useState<UserEntitlement[]>([])
  const [youtubeConnected, setYoutubeConnected] = useState(false)
  const [youtubeGoogleEmail, setYoutubeGoogleEmail] = useState<string | null>(null)
  const [youtubeChannelTitle, setYoutubeChannelTitle] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const authUseCase = useRef(new AuthUseCase(new AuthApiAdapter(httpClient), httpClient)).current

  const clearSession = useCallback(() => {
    setUser(null)
    setOrganizationId(null)
    setEntitlements([])
    setYoutubeConnected(false)
    setYoutubeGoogleEmail(null)
    setYoutubeChannelTitle(null)
  }, [])

  const applyCurrentUser = useCallback((current: Result<CurrentUser, AuthError>): AuthError | null => {
    if (!current.ok) return current.error
    setUser(current.value.user)
    setOrganizationId(current.value.organizationId)
    setEntitlements(current.value.entitlements)
    setYoutubeConnected(current.value.youtubeConnected)
    setYoutubeGoogleEmail(current.value.youtubeGoogleEmail)
    setYoutubeChannelTitle(current.value.youtubeChannelTitle)
    return null
  }, [])

  const restoreSession = useCallback(async () => {
    return applyCurrentUser(await authUseCase.restoreSession())
  }, [authUseCase, applyCurrentUser])

  useEffect(() => {
    return authUseCase.onSessionExpired(() => clearSession())
  }, [authUseCase, clearSession])

  useEffect(() => {
    void restoreSession().finally(() => setIsLoading(false))
  }, [restoreSession])

  const login = useCallback(
    async (credentials: AuthCredentials) => applyCurrentUser(await authUseCase.login(credentials)),
    [authUseCase, applyCurrentUser],
  )

  const register = useCallback(
    async (credentials: AuthCredentials) => applyCurrentUser(await authUseCase.register(credentials)),
    [authUseCase, applyCurrentUser],
  )

  const logout = useCallback(async () => {
    await authUseCase.logout()
    clearSession()
  }, [authUseCase, clearSession])

  const refreshEntitlements = useCallback(async () => {
    const result = await authUseCase.refreshEntitlements()
    if (result) applyCurrentUser(result)
  }, [authUseCase, applyCurrentUser])

  const hasActiveFeature = useCallback(
    (feature: string) => entitlements.some((e) => e.feature === feature && e.active),
    [entitlements],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      organizationId,
      entitlements,
      youtubeConnected,
      youtubeGoogleEmail,
      youtubeChannelTitle,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
      hasActiveFeature,
      refreshEntitlements,
    }),
    [
      user,
      organizationId,
      entitlements,
      youtubeConnected,
      youtubeGoogleEmail,
      youtubeChannelTitle,
      isLoading,
      login,
      register,
      logout,
      hasActiveFeature,
      refreshEntitlements,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
