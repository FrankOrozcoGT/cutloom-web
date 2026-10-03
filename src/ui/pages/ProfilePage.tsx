import { useAuth } from '@ui/auth/useAuth'
import { Button } from '@ui/components/Button'
import { platformLabel, type PublishingPlatform } from '@domain/platform'
import { startPlatformOAuth } from '@ui/publishing/oauth'
import { useToast } from '@ui/toasts/useToast'

export function ProfilePage() {
  const { isAuthenticated, user, youtubeConnected, youtubeChannelTitle, tiktokConnected, tiktokDisplayName } = useAuth()
  const { showToast } = useToast()

  const handleConnect = async (platform: PublishingPlatform) => {
    try {
      await startPlatformOAuth(platform, '/profile')
    } catch {
      showToast(`No se pudo iniciar la conexión con ${platformLabel(platform)}. Intentá de nuevo.`)
    }
  }

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
                className="cursor-pointer text-xs text-text-muted underline-offset-2 hover:text-text-strong hover:underline"
                onClick={() => void handleConnect('youtube')}
              >
                {youtubeChannelTitle ? 'Reconectar' : 'Reconectar para ver detalles'}
              </button>
            </div>
          ) : (
            <Button type="button" className="w-fit" onClick={() => void handleConnect('youtube')}>
              Conectar YouTube
            </Button>
          )}
          {tiktokConnected ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                {tiktokDisplayName ? `Conectado a TikTok como ${tiktokDisplayName}` : 'Conectado a TikTok'}
              </p>
              <button
                type="button"
                className="cursor-pointer text-xs text-text-muted underline-offset-2 hover:text-text-strong hover:underline"
                onClick={() => void handleConnect('tiktok')}
              >
                {tiktokDisplayName ? 'Reconectar' : 'Reconectar para ver detalles'}
              </button>
            </div>
          ) : (
            <Button type="button" className="w-fit" onClick={() => void handleConnect('tiktok')}>
              Conectar TikTok
            </Button>
          )}
        </>
      ) : (
        <p className="text-text-muted">Inicia sesión para ver tu perfil.</p>
      )}
    </div>
  )
}
