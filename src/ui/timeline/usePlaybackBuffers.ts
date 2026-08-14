import { useEffect, useState } from 'react'
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

/**
 * Gestiona los dos buffers (blob URLs) de video para el doble buffer de
 * reproducción. Responsabilidad única: qué asset carga en cada slot y
 * liberar los blob URLs viejos. No sabe nada de currentTime, play/pause
 * ni del timeline — solo mapea clip → URL de blob.
 */
export function usePlaybackBuffers(
  assets: Record<string, VideoAsset>,
  activeClip: ClipRef | null,
  waitingClip: ClipRef | null,
) {
  const [activeBuffer, setActiveBuffer] = useState<PlaybackBuffer>(EMPTY_BUFFER)
  const [waitingBuffer, setWaitingBuffer] = useState<PlaybackBuffer>(EMPTY_BUFFER)

  useEffect(() => {
    if (!activeClip) return
    const asset = assets[activeClip.assetId]
    if (!asset) return

    setActiveBuffer((prev) => {
      if (prev.clipId === activeClip.id) return prev
      if (prev.url) URL.revokeObjectURL(prev.url)
      return { clipId: activeClip.id, url: URL.createObjectURL(asset.blob) }
    })
  }, [activeClip, assets])

  useEffect(() => {
    if (!waitingClip) return
    const asset = assets[waitingClip.assetId]
    if (!asset) return

    setWaitingBuffer((prev) => {
      if (prev.clipId === waitingClip.id) return prev
      if (prev.url) URL.revokeObjectURL(prev.url)
      return { clipId: waitingClip.id, url: URL.createObjectURL(asset.blob) }
    })
  }, [waitingClip, assets])

  useEffect(() => {
    return () => {
      if (activeBuffer.url) URL.revokeObjectURL(activeBuffer.url)
      if (waitingBuffer.url) URL.revokeObjectURL(waitingBuffer.url)
    }
    // Solo debe limpiar al desmontar el componente, no en cada cambio de buffer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Intercambia cuál buffer es "activo" tras cruzar el límite de un clip. */
  function swap() {
    setActiveBuffer(waitingBuffer)
    setWaitingBuffer(activeBuffer)
  }

  return { activeBuffer, waitingBuffer, swap }
}
