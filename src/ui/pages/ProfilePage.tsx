import { useAuth } from '@ui/auth/useAuth'
import { Button } from '@ui/components/Button'
import { startYouTubeOAuth } from '@ui/publishing/oauth'

export function ProfilePage() {
  const { isAuthenticated, user, youtubeConnected } = useAuth()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-text-strong">Perfil</h1>
      {isAuthenticated ? (
        <>
          <p className="text-text-muted">{user?.name ?? user?.email}</p>
          {youtubeConnected ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-text-muted">YouTube conectado.</p>
              <Button
                type="button"
                variant="secondary"
                className="w-fit"
                onClick={() => void startYouTubeOAuth('/profile')}
              >
                Reconectar YouTube
              </Button>
            </div>
          ) : (
            <Button type="button" className="w-fit" onClick={() => void startYouTubeOAuth('/profile')}>
              Conectar YouTube
            </Button>
          )}
        </>
      ) : (
        <p className="text-text-muted">Inicia sesión para ver tu perfil.</p>
      )}
    </div>
  )
}
