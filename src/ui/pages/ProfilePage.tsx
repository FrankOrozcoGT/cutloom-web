import { useAuth } from '@ui/auth/useAuth'
import { Button } from '@ui/components/Button'
import { startYouTubeOAuth } from '@ui/publishing/oauth'

export function ProfilePage() {
  const { isAuthenticated, user, youtubeConnected, youtubeChannelTitle } = useAuth()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-text-strong">Perfil</h1>
      {isAuthenticated ? (
        <>
          <p className="text-text-muted">{user?.name ?? user?.email}</p>
          {youtubeConnected ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                {youtubeChannelTitle ? `Conectado a YouTube como ${youtubeChannelTitle}` : 'Conectado a YouTube'}
              </p>
              <button
                type="button"
                className="text-xs text-text-muted underline-offset-2 hover:text-text-strong hover:underline"
                onClick={() => void startYouTubeOAuth('/profile')}
              >
                {youtubeChannelTitle ? 'Reconectar' : 'Reconectar para ver detalles'}
              </button>
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
