import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AuthCredentials, User } from '@domain/auth'
import { AuthApiAdapter } from '@infrastructure/auth/adapter'
import { httpClient } from '@infrastructure/http/client'
import { AuthContext, type AuthContextValue } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const authApi = useRef(new AuthApiAdapter(httpClient)).current

  const restoreSession = useCallback(async () => {
    const refreshResult = await authApi.refreshToken()
    if (!refreshResult.ok) return refreshResult.error

    httpClient.setAccessToken(refreshResult.value.accessToken)
    const userResult = await authApi.getCurrentUser(refreshResult.value.accessToken)
    if (!userResult.ok) return userResult.error

    setUser(userResult.value)
    return null
  }, [authApi])

  useEffect(() => {
    httpClient.setSessionExpiredHandler(() => setUser(null))
    return () => httpClient.setSessionExpiredHandler(null)
  }, [])

  const restorePromiseRef = useRef<Promise<unknown> | null>(null)

  useEffect(() => {
    if (!restorePromiseRef.current) {
      restorePromiseRef.current = restoreSession()
    }
    restorePromiseRef.current.finally(() => setIsLoading(false))
  }, [restoreSession])

  const login = useCallback(
    async (credentials: AuthCredentials) => {
      const result = await authApi.login(credentials)
      if (!result.ok) return result.error
      httpClient.setAccessToken(result.value.accessToken)
      setUser(result.value.user)
      return null
    },
    [authApi],
  )

  const register = useCallback(
    async (credentials: AuthCredentials) => {
      const result = await authApi.register(credentials)
      if (!result.ok) return result.error
      httpClient.setAccessToken(result.value.accessToken)
      setUser(result.value.user)
      return null
    },
    [authApi],
  )

  const logout = useCallback(async () => {
    await authApi.logout()
    httpClient.setAccessToken(null)
    setUser(null)
  }, [authApi])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      restoreSession,
      logout,
    }),
    [user, isLoading, login, register, restoreSession, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
