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

export interface PlaybackSlots {
  active: PlaybackBuffer
  waiting: PlaybackBuffer
  /** true si el slot 'active' de arriba corresponde al <video> físico A (vs. B) — TimelinePlayer lo usa para decidir a cuál de los dos <video> del DOM asignar visibility/mute. */
  activeIsSlotA: boolean
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
 * reproducción, y decide qué slot físico (A/B) sirve el clip activo vs. el
 * que se está precargando — todo en un único lugar, con acceso directo al
 * estado ya commiteado de ambos slots (no una copia externa que pueda
 * desincronizarse un render).
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
  const [bufferA, setBufferA] = useState<PlaybackBuffer>(EMPTY_BUFFER)
  const [bufferB, setBufferB] = useState<PlaybackBuffer>(EMPTY_BUFFER)

  const activeIsSlotA = activeClip === null || bufferB.clipId !== activeClip.id

  const wantsA = activeIsSlotA ? activeClip : waitingClip
  const wantsB = activeIsSlotA ? waitingClip : activeClip

  useEffect(() => {
    setBufferA((prev) => loadBuffer(prev, wantsA, assets))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsA?.id, assets])

  useEffect(() => {
    setBufferB((prev) => loadBuffer(prev, wantsB, assets))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsB?.id, assets])

  useRevokeOnChange(bufferA.url)
  useRevokeOnChange(bufferB.url)

  return {
    active: activeIsSlotA ? bufferA : bufferB,
    waiting: activeIsSlotA ? bufferB : bufferA,
    activeIsSlotA,
  }
}
