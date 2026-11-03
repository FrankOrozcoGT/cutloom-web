import { useEffect, useRef, useState } from 'react'
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny'
import type { Render } from '@domain/render'

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
    void (async () => {
      const input = new Input({ source: new BlobSource(render.blob), formats: ALL_FORMATS })
      const track = await input.getPrimaryVideoTrack()
      if (!track) return null
      const sink = new VideoSampleSink(track)
      const sample = await sink.getSample(atMs / 1000)
      if (!sample) return null
      try {
        const canvas = document.createElement('canvas')
        canvas.width = sample.displayWidth
        canvas.height = sample.displayHeight
        const context = canvas.getContext('2d')
        if (!context) return null
        sample.draw(context, 0, 0)
        return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      } finally {
        sample.close()
      }
    })().then((blob) => {
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
