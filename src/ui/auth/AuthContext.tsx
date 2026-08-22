import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AuthCredentials, User } from '@domain/auth'
import { authUseCase, httpClient } from '@ui/auth/composition'
import { AuthContext, type AuthContextValue } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const restoreSession = useCallback(async () => {
    const result = await authUseCase.restoreSession()
    if (!result.ok) return result.error
    setUser(result.value)
    return null
  }, [])

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

  const login = useCallback(async (credentials: AuthCredentials) => {
    const result = await authUseCase.login(credentials)
    if (!result.ok) return result.error
    setUser(result.value)
    return null
  }, [])

  const register = useCallback(async (credentials: AuthCredentials) => {
    const result = await authUseCase.register(credentials)
    if (!result.ok) return result.error
    setUser(result.value)
    return null
  }, [])

  const logout = useCallback(async () => {
    await authUseCase.logout()
    setUser(null)
  }, [])

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
