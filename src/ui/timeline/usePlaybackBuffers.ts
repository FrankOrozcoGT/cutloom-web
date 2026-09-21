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

export interface PlaybackSlots {
  active: PlaybackBuffer
  waiting: PlaybackBuffer
  /** true si el slot 'active' de arriba corresponde al <video> físico A (vs. B) — TimelinePlayer lo usa para decidir a cuál de los dos <video> del DOM asignar visibility/mute. */
  activeIsSlotA: boolean
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

/**
 * Gestiona los dos buffers físicos (blob URLs, vía el pool compartido) del
 * doble buffer de reproducción, y decide qué slot físico (A/B) sirve el
 * clip activo vs. el que se está precargando — todo en un único lugar, con
 * acceso directo al estado ya commiteado de ambos slots (no una copia
 * externa que pueda desincronizarse un render).
 *
 * Regla de asignación, pura y sin memoria de "quién era el rol antes": el
 * slot que YA tiene cargado el clip activo se queda sirviéndolo — nunca se
 * le pide recargar algo que ya tiene. El otro slot pasa a precargar el
 * clip en espera. Si ningún slot tiene el activo todavía (arranque en frío,
 * o el playhead saltó a un clip que nunca se precargó), el slot A lo toma
 * por defecto y B pasa a precargar el waiting — sin casos especiales: la
 * siguiente vez que este mismo clip sea el activo, ya estará en A y la regla
 * de arriba lo reconoce sin ningún ajuste adicional.
 */
export function usePlaybackBuffers(
  assets: Record<string, VideoAsset>,
  activeClip: ClipRef | null,
  waitingClip: ClipRef | null,
): PlaybackSlots {
  // slotAClipId/slotBClipId reflejan qué clipId tiene cargado cada slot
  // FÍSICO ahora mismo (estado del render anterior, vía el useState interno
  // de useBufferSlot) — se leen antes de decidir qué pedirle a cada uno, así
  // la asignación de roles no depende de un ref corregido para el próximo
  // render, que dejaría una ventana de un frame con el rol desalineado.
  const slotAHeldRef = useRef<string | null>(null)
  const slotBHeldRef = useRef<string | null>(null)

  const activeIsSlotA = activeClip === null || slotBHeldRef.current !== activeClip.id

  const wantsA = activeIsSlotA ? activeClip : waitingClip
  const wantsB = activeIsSlotA ? waitingClip : activeClip

  const slotA = useBufferSlot(assets, wantsA)
  const slotB = useBufferSlot(assets, wantsB)

  slotAHeldRef.current = slotA.clipId
  slotBHeldRef.current = slotB.clipId

  return {
    active: activeIsSlotA ? slotA : slotB,
    waiting: activeIsSlotA ? slotB : slotA,
    activeIsSlotA,
  }
}
