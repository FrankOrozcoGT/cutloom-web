import { useEffect, useRef, useState } from 'react'
import type { Render } from '@domain/render'
import { captureFrame } from '@infrastructure/video/captureFrame'

/**
 * Captura un único frame estático del Render del proyecto en atMs — mismo
 * patrón mediabunny/WebCodecs que useTimelineFrame, pero sobre un único
 * archivo plano (el render ya consolidado) en vez de resolver qué clip del
 * timeline está activo: no hace falta, el render es un solo archivo.
 */
export function useRenderFrame(render: Render | null, atMs: number): string | null {
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const frameUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!render) {
      if (frameUrlRef.current) {
        URL.revokeObjectURL(frameUrlRef.current)
        frameUrlRef.current = null
      }
      setFrameUrl(null)
      return
    }

    let cancelled = false
    void captureFrame(render.blob, atMs / 1000).then((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      // Si esta invocación ya fue cancelada (render/atMs cambiaron, o el
      // componente se desmontó) mientras captureFrame estaba en vuelo, la
      // URL vieja ya fue revocada por el cleanup de abajo — revocar esta
      // de una, nunca dejarla viva sin nadie que la referencie ni que la
      // vaya a revocar después.
      if (cancelled) {
        URL.revokeObjectURL(url)
        return
      }
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current)
      frameUrlRef.current = url
      setFrameUrl(url)
    })

    return () => {
      cancelled = true
    }
  }, [render, atMs])

  useEffect(() => {
    return () => {
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current)
    }
  }, [])

  return frameUrl
}
