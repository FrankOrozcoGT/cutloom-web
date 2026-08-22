import { useEffect, useRef, useState } from 'react'
import type { VideoAsset } from '@domain/video'
import { acquireBlobUrl, releaseBlobUrl } from './blobUrlPool'

export interface PlaybackBuffer {
  clipId: string | null
  assetId: string | null
  url: string
}

const EMPTY_BUFFER: PlaybackBuffer = { clipId: null, assetId: null, url: '' }

interface ClipRef {
  id: string
  assetId: string
}

/**
 * Un slot del doble buffer: pide/suelta su blob URL al pool compartido
 * (blobUrlPool) por assetId, nunca crea/revoca directamente — así nunca
 * puede revocar algo que otro slot todavía referencia. clipId se guarda
 * aparte porque usePlaybackEngine lo necesita para saber qué slot sirve a
 * qué clip; cortar un clip (splitClip) le da un id nuevo sin cambiar de
 * archivo, así que solo se pide/suelta del pool cuando cambia el assetId.
 */
function useBufferSlot(assets: Record<string, VideoAsset>, wants: ClipRef | null): PlaybackBuffer {
  const [buffer, setBuffer] = useState<PlaybackBuffer>(EMPTY_BUFFER)
  const heldAssetIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!wants) return
    const asset = assets[wants.assetId]

    if (!asset) {
      if (heldAssetIdRef.current) {
        releaseBlobUrl(heldAssetIdRef.current)
        heldAssetIdRef.current = null
      }
      setBuffer(EMPTY_BUFFER)
      return
    }

    if (heldAssetIdRef.current === wants.assetId) {
      setBuffer((prev) => (prev.clipId === wants.id ? prev : { ...prev, clipId: wants.id }))
      return
    }

    const url = acquireBlobUrl(wants.assetId, asset.blob)
    const previousAssetId = heldAssetIdRef.current
    heldAssetIdRef.current = wants.assetId
    setBuffer({ clipId: wants.id, assetId: wants.assetId, url })
    if (previousAssetId) {
      releaseBlobUrl(previousAssetId)
    }
  }, [wants, assets])

  useEffect(() => {
    return () => {
      if (heldAssetIdRef.current) {
        releaseBlobUrl(heldAssetIdRef.current)
        heldAssetIdRef.current = null
      }
    }
  }, [])

  return buffer
}

export function usePlaybackBuffers(
  assets: Record<string, VideoAsset>,
  wantsA: ClipRef | null,
  wantsB: ClipRef | null,
) {
  const bufferA = useBufferSlot(assets, wantsA)
  const bufferB = useBufferSlot(assets, wantsB)
  return { bufferA, bufferB }
}
