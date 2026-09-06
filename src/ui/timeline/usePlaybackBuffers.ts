import { useEffect, useRef, useState } from 'react'
import type { VideoAsset } from '@domain/video'

export interface PlaybackBuffer {
  clipId: string | null
  url: string
}

const EMPTY_BUFFER: PlaybackBuffer = { clipId: null, url: '' }

interface ClipRef {
  id: string
  assetId: string
}

function loadBuffer(prev: PlaybackBuffer, clip: ClipRef | null, assets: Record<string, VideoAsset>): PlaybackBuffer {
  if (!clip) return prev
  const asset = assets[clip.assetId]
  if (!asset) return EMPTY_BUFFER
  if (prev.clipId === clip.id) return prev
  return { clipId: clip.id, url: URL.createObjectURL(asset.blob) }
}

/**
 * Revoca `url` un tick después de que React ya haya commiteado el nuevo
 * valor al DOM (efecto separado, corre después del render) — revocar en el
 * mismo cálculo que produce el buffer nuevo puede invalidar la blob URL
 * mientras el <video> todavía apunta a ella (net::ERR_FILE_NOT_FOUND).
 */
function useRevokeOnChange(url: string): void {
  const prevUrl = useRef<string | null>(null)

  useEffect(() => {
    if (prevUrl.current && prevUrl.current !== url) {
      URL.revokeObjectURL(prevUrl.current)
    }
    prevUrl.current = url || null
  }, [url])

  useEffect(() => {
    return () => {
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
    }
  }, [])
}

/**
 * Gestiona los dos buffers físicos (blob URLs) del doble buffer de
 * reproducción. Cada slot (A/B) se limita a cargar el clip que le toca según
 * `wantsA`/`wantsB` — no hay concepto de "activo/en espera" ni swap aquí:
 * ese rol se deriva puro en usePlaybackEngine comparando qué slot ya tiene
 * cargado el clip activo. Un slot puede pasar de servir el clip activo a
 * precargar el siguiente (o viceversa) sin que sus datos se muevan de sitio.
 */
export function usePlaybackBuffers(
  assets: Record<string, VideoAsset>,
  wantsA: ClipRef | null,
  wantsB: ClipRef | null,
) {
  const [bufferA, setBufferA] = useState<PlaybackBuffer>(EMPTY_BUFFER)
  const [bufferB, setBufferB] = useState<PlaybackBuffer>(EMPTY_BUFFER)

  useEffect(() => {
    setBufferA((prev) => loadBuffer(prev, wantsA, assets))
  }, [wantsA, assets])

  useEffect(() => {
    setBufferB((prev) => loadBuffer(prev, wantsB, assets))
  }, [wantsB, assets])

  useRevokeOnChange(bufferA.url)
  useRevokeOnChange(bufferB.url)

  return { bufferA, bufferB }
}
