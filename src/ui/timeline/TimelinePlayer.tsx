import { useEffect, useRef, useState } from 'react'
import { findActiveClip, findNextClip, getTimelineDurationMs, type Timeline } from '@domain/timeline'
import type { VideoAsset } from '@domain/video'

interface TimelinePlayerProps {
  timeline: Timeline
  assets: Record<string, VideoAsset>
  playheadMs: number
  isPlaying: boolean
  onPlayheadChange: (ms: number) => void
  onPlayingChange: (isPlaying: boolean) => void
}

interface Buffer {
  clipId: string | null
  url: string
}

const EMPTY_BUFFER: Buffer = { clipId: null, url: '' }

/**
 * Doble buffer de <video>: mientras el slot activo reproduce el clip actual,
 * el slot en espera precarga el siguiente clip. Al cruzar el límite del clip
 * activo se alternan sin recrear el elemento <video>, evitando el salto/frame
 * congelado que produce cambiar `src` sobre la marcha en un único <video>.
 */
export function TimelinePlayer({
  timeline,
  assets,
  playheadMs,
  isPlaying,
  onPlayheadChange,
  onPlayingChange,
}: TimelinePlayerProps) {
  const videoRef0 = useRef<HTMLVideoElement>(null)
  const videoRef1 = useRef<HTMLVideoElement>(null)
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0)
  const [buffer0, setBuffer0] = useState<Buffer>(EMPTY_BUFFER)
  const [buffer1, setBuffer1] = useState<Buffer>(EMPTY_BUFFER)

  const durationMs = getTimelineDurationMs(timeline)
  const active = findActiveClip(timeline, playheadMs)
  const nextClip = active ? findNextClip(timeline, active.clip.id) : null

  const activeVideoRef = activeSlot === 0 ? videoRef0 : videoRef1
  const waitingVideoRef = activeSlot === 0 ? videoRef1 : videoRef0
  const activeBuffer = activeSlot === 0 ? buffer0 : buffer1
  const waitingBuffer = activeSlot === 0 ? buffer1 : buffer0
  const setActiveBuffer = activeSlot === 0 ? setBuffer0 : setBuffer1
  const setWaitingBuffer = activeSlot === 0 ? setBuffer1 : setBuffer0

  const activeClipId = active?.clip.id ?? null
  const activeAssetId = active?.clip.assetId ?? null
  const activeSourceTimeMs = active?.sourceTimeMs ?? null
  const nextClipId = nextClip?.id ?? null
  const nextAssetId = nextClip?.assetId ?? null
  const nextSourceStartMs = nextClip?.sourceStartMs ?? null

  // Asegura que el slot activo apunte al asset del clip activo.
  useEffect(() => {
    if (!activeClipId || !activeAssetId) return
    const asset = assets[activeAssetId]
    if (!asset) return

    setActiveBuffer((prev) => {
      if (prev.clipId === activeClipId) return prev
      if (prev.url) URL.revokeObjectURL(prev.url)
      return { clipId: activeClipId, url: URL.createObjectURL(asset.blob) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClipId, activeAssetId, assets])

  // Precarga el siguiente clip en el slot en espera.
  useEffect(() => {
    if (!nextClipId || !nextAssetId) return
    const asset = assets[nextAssetId]
    if (!asset) return

    setWaitingBuffer((prev) => {
      if (prev.clipId === nextClipId) return prev
      if (prev.url) URL.revokeObjectURL(prev.url)
      return { clipId: nextClipId, url: URL.createObjectURL(asset.blob) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextClipId, nextAssetId, assets])

  useEffect(() => {
    return () => {
      if (buffer0.url) URL.revokeObjectURL(buffer0.url)
      if (buffer1.url) URL.revokeObjectURL(buffer1.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Alinea currentTime del video activo con el punto correspondiente del clip
  // SOLO cuando cambia el clip activo o su buffer termina de cargar — no en cada
  // tick de reproducción, donde sourceTimeMs avanza naturalmente por sí mismo.
  useEffect(() => {
    const video = activeVideoRef.current
    if (!video || activeClipId === null || activeSourceTimeMs === null || activeBuffer.clipId !== activeClipId) {
      return
    }
    const targetSeconds = activeSourceTimeMs / 1000
    if (Math.abs(video.currentTime - targetSeconds) > 0.5) {
      video.currentTime = targetSeconds
    }
    // activeSourceTimeMs se usa solo como valor inicial al cambiar de clip/buffer;
    // no debe re-disparar este efecto en cada avance normal de reproducción.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClipId, activeBuffer, activeVideoRef])

  // Prepara el buffer en espera en su punto de inicio (sourceStartMs) para un corte limpio.
  useEffect(() => {
    const video = waitingVideoRef.current
    if (!video || nextClipId === null || nextSourceStartMs === null || waitingBuffer.clipId !== nextClipId) return
    video.currentTime = nextSourceStartMs / 1000
  }, [nextClipId, nextSourceStartMs, waitingBuffer, waitingVideoRef])

  useEffect(() => {
    waitingVideoRef.current?.pause()
    const video = activeVideoRef.current
    if (!video) return
    if (isPlaying && activeClipId !== null) {
      void video.play()
    } else {
      video.pause()
    }
  }, [isPlaying, activeClipId, activeVideoRef, waitingVideoRef])

  // Hueco sin clips: el playhead avanza en tiempo real de reloj (pantalla negra),
  // igual que un editor real — nunca salta el hueco, lo reproduce como tiempo vacío.
  useEffect(() => {
    if (!isPlaying || activeClipId !== null) return

    let rafId: number
    let lastTimestamp: number | null = null

    function tick(timestamp: number) {
      if (lastTimestamp === null) lastTimestamp = timestamp
      const elapsedMs = timestamp - lastTimestamp
      lastTimestamp = timestamp

      const nextPlayheadMs = playheadMs + elapsedMs
      if (nextPlayheadMs >= durationMs) {
        onPlayheadChange(durationMs)
        onPlayingChange(false)
        return
      }
      onPlayheadChange(nextPlayheadMs)
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // playheadMs se lee solo como valor inicial del tick; incluirlo reiniciaría el rAF en cada frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, activeClipId, durationMs, onPlayheadChange, onPlayingChange])

  // El playhead avanza siguiendo timeupdate del video activo; al llegar al borde
  // del clip, alterna el slot activo hacia el buffer ya precargado (sin recorte visible).
  // Depende solo de IDs/valores primitivos: `active` es un objeto nuevo en cada
  // render y usarlo como dependencia re-suscribiría el listener constantemente
  // durante la reproducción, además de arriesgar closures con datos obsoletos.
  useEffect(() => {
    const video = activeVideoRef.current
    if (!video || activeClipId === null || activeSourceTimeMs === null || !active) return

    const clipOffsetMs = active.clip.offsetMs
    const clipDurationMs = active.clip.durationMs
    const clipSourceStartMs = active.clip.sourceStartMs
    const hasNextClip = nextClipId !== null

    function handleTimeUpdate() {
      const localMs = video!.currentTime * 1000 - clipSourceStartMs
      const nextPlayheadMs = clipOffsetMs + localMs

      if (nextPlayheadMs >= durationMs) {
        onPlayheadChange(durationMs)
        onPlayingChange(false)
        return
      }

      const clipEndMs = clipOffsetMs + clipDurationMs
      if (nextPlayheadMs >= clipEndMs && hasNextClip) {
        setActiveSlot((slot) => (slot === 0 ? 1 : 0))
      }

      onPlayheadChange(nextPlayheadMs)
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => video.removeEventListener('timeupdate', handleTimeUpdate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClipId, nextClipId, durationMs, activeVideoRef, onPlayheadChange, onPlayingChange])

  const hasContent = active !== null
  const isWithinTimelineRange = playheadMs >= 0 && playheadMs < durationMs

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-lg border border-border bg-bg"
      style={{ height: 220 }}
    >
      {!hasContent && (
        <span className="text-sm text-text-muted">
          {isWithinTimelineRange ? '' : 'Sin contenido en esta posición'}
        </span>
      )}
      <video
        ref={videoRef0}
        src={buffer0.url || undefined}
        muted={activeSlot !== 0}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ visibility: activeSlot === 0 && hasContent ? 'visible' : 'hidden' }}
      />
      <video
        ref={videoRef1}
        src={buffer1.url || undefined}
        muted={activeSlot !== 1}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ visibility: activeSlot === 1 && hasContent ? 'visible' : 'hidden' }}
      />
    </div>
  )
}
