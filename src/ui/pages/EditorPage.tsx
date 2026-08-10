import { useAuth } from '@ui/auth/useAuth'
import { LogoutButton } from '@ui/components/LogoutButton'

export function EditorPage() {
  const { user } = useAuth()

  return (
    <div className="min-h-svh bg-bg">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-sm text-text-strong">{user?.name ?? user?.email}</span>
        <LogoutButton />
      </header>
      <p className="p-6 text-text-muted">Editor en construcción.</p>
    </div>
  )
}
