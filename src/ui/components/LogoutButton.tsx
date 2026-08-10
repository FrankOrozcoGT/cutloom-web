import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'

export function LogoutButton() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-strong transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isLoggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
    </button>
  )
}
