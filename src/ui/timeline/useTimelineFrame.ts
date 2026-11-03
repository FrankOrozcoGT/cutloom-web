import { useEffect, useRef, useState } from 'react'
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny'
import { findActiveClip, type Timeline } from '@domain/timeline'
import type { ProxyAsset } from '@domain/video'

async function captureFrame(blob: Blob, atSeconds: number): Promise<Blob | null> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  const track = await input.getPrimaryVideoTrack()
  if (!track) return null

  const sink = new VideoSampleSink(track)
  const sample = await sink.getSample(atSeconds)
  if (!sample) return null

  try {
    const canvas = document.createElement('canvas')
    canvas.width = sample.displayWidth
    canvas.height = sample.displayHeight
    const context = canvas.getContext('2d')
    if (!context) return null
    sample.draw(context, 0, 0)
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  } finally {
    sample.close()
  }
}

/**
 * Captura un único frame estático del timeline compuesto en atMs, a partir
 * del PROXY del clip activo (nunca del VideoAsset original), sin montar
 * ningún <video> ni el motor de reproducción (usePlaybackEngine) — pensado
 * para previews en reposo (ej. ShortCard) donde se necesitan muchas instancias
 * a la vez mostrando un frame fijo, caso para el que el motor de reproducción
 * multi-clip (doble buffer, locks de seek, listeners de timeupdate) es la
 * herramienta equivocada: nunca reproduce, solo necesita "la imagen en este
 * instante".
 *
 * Decodifica con mediabunny (WebCodecs) en vez de un elemento <video> del DOM
 * — un <video> real depende de los decoders de hardware limitados del
 * navegador, que varias instancias compitiendo a la vez pueden agotar
 * (algunas quedan con readyState alto pero sin pintar ningún frame, sin
 * ningún error). mediabunny ya se usa en el proyecto para extraer audio
 * (ver AudioExtractionAdapter) con el mismo patrón Input/BlobSource.
 */
export function useTimelineFrame(
  timeline: Timeline,
  proxies: Record<string, ProxyAsset>,
  atMs: number,
): string | null {
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const frameUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const active = findActiveClip(timeline, atMs)
    const proxy = active ? proxies[active.clip.assetId] : null
    if (!active || !proxy) {
      setFrameUrl(null)
      return
    }

    let cancelled = false
    void captureFrame(proxy.blob, active.sourceTimeMs / 1000).then((blob) => {
      if (cancelled || !blob) return
      const url = URL.createObjectURL(blob)
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current)
      frameUrlRef.current = url
      setFrameUrl(url)
    })

    return () => {
      cancelled = true
    }
  }, [timeline, proxies, atMs])

  useEffect(() => {
    return () => {
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current)
    }
  }, [])

  return frameUrl
}
