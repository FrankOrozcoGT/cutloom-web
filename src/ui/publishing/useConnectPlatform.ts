import { useCallback } from 'react'
import { platformLabel, type PublishingPlatform } from '@domain/platform'
import { startPlatformOAuth } from '@ui/publishing/oauth'
import { useToast } from '@ui/toasts/useToast'

/** Inicia el OAuth de una plataforma y muestra un toast si falla — mismo patrón en ProfilePage y PublishingPage, solo cambia returnTo. */
export function useConnectPlatform(returnTo: string) {
  const { showToast } = useToast()

  return useCallback(
    async (platform: PublishingPlatform) => {
      try {
        await startPlatformOAuth(platform, returnTo)
      } catch {
        showToast(`No se pudo iniciar la conexión con ${platformLabel(platform)}. Intentá de nuevo.`)
      }
    },
    [returnTo, showToast],
  )
}
