import { useAuth } from '@ui/auth/useAuth'

export function ProfilePage() {
  const { isAuthenticated, user } = useAuth()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-text-strong">Perfil</h1>
      {isAuthenticated ? (
        <p className="text-text-muted">{user?.name ?? user?.email}</p>
      ) : (
        <p className="text-text-muted">Inicia sesión para ver tu perfil.</p>
      )}
    </div>
  )
}
