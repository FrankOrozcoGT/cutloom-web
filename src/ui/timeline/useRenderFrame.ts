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
      setFrameUrl(null)
      return
    }

    let cancelled = false
    void captureFrame(render.blob, atMs / 1000).then((blob) => {
      if (cancelled || !blob) return
      const url = URL.createObjectURL(blob)
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
