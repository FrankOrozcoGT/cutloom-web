import { useCallback, useEffect, useState } from 'react'
import type { PublishingCapabilities } from '@domain/platform'
import type { PublishingError } from '@application/publishing/errors'
import { publishingCapabilities } from '@ui/publishing/composition'
import { useAuth } from '@ui/auth/useAuth'

const DEFAULT_CAPABILITIES: PublishingCapabilities = { apiAvailable: false, connected: false }

export function useTikTokCapabilities() {
  const { isLoading: isAuthLoading } = useAuth()
  const [capabilities, setCapabilities] = useState<PublishingCapabilities>(DEFAULT_CAPABILITIES)
  const [isLoading, setIsLoading] = useState(true)
  // Error real del último intento — null no significa "todo bien", significa "sin error pendiente
  // de mostrar". Antes un fallo (401, red caída, lo que sea) caía en silencio a DEFAULT_CAPABILITIES,
  // indistinguible de "TikTok genuinamente no disponible" — ningún error se traga invisible.
  const [error, setError] = useState<PublishingError | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    const result = await publishingCapabilities.getCapabilities('tiktok')
    if (result.ok) {
      setCapabilities(result.value)
      setError(null)
    } else {
      console.error('No se pudieron consultar las capacidades de TikTok:', result.error)
      setCapabilities(DEFAULT_CAPABILITIES)
      setError(result.error)
    }
    setIsLoading(false)
  }, [])

  // Esperar a que termine de restaurarse la sesión antes de disparar el fetch — si sale mientras
  // AuthContext todavía está en restoreSession(), httpClient.accessToken sigue siendo null en ese
  // instante y el request sale sin Authorization, dando un 401 espurio.
  useEffect(() => {
    if (isAuthLoading) return
    void refresh()
  }, [isAuthLoading, refresh])

  return { capabilities, isLoading, error, refresh }
}
