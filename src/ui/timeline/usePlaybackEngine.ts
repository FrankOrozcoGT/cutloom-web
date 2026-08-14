import { useEffect, useRef, useState } from 'react'
import type { Timeline } from '@domain/timeline'
import type { VideoAsset } from '@domain/video'
import { computePlaybackSnapshot } from './playbackEngine'
import { usePlaybackBuffers } from './usePlaybackBuffers'

interface UsePlaybackEngineArgs {
  timeline: Timeline
  assets: Record<string, VideoAsset>
  playheadMs: number
  isPlaying: boolean
  onPlayheadChange: (ms: number) => void
  onPlayingChange: (isPlaying: boolean) => void
}

/**
 * Motor de reproducción del timeline compuesto. Reduce el estado a un único
 * snapshot derivado (computePlaybackSnapshot) y aplica sus consecuencias al
 * DOM en efectos con una sola responsabilidad cada uno:
 *  1. buffers    — qué asset carga en cada <video> (delegado a usePlaybackBuffers)
 *  2. seek       — reposicionar currentTime cuando el usuario mueve el playhead
 *  3. play/pause — arrancar/detener el <video> activo según isPlaying
 *  4. avance     — reportar el playhead hacia arriba, ya sea vía timeupdate
 *                  del <video> (dentro de un clip) o un reloj propio (huecos)
 *
 * activeVideoRef siempre apunta al slot que se debe ver/escuchar; tras cruzar
 * el borde de un clip, los buffers hacen swap() y el mismo ref pasa a apuntar
 * al elemento que ya tenía el siguiente clip precargado — sin recrear <video>.
 */
export function usePlaybackEngine({
  timeline,
  assets,
  playheadMs,
  isPlaying,
  onPlayheadChange,
  onPlayingChange,
}: UsePlaybackEngineArgs) {
  const videoRefA = useRef<HTMLVideoElement>(null)
  const videoRefB = useRef<HTMLVideoElement>(null)
  const activeIsA = useRef(true)

  const snapshot = computePlaybackSnapshot(timeline, playheadMs)
  const { activeClip, waitingClip, durationMs, mode } = snapshot

  const { activeBuffer, waitingBuffer, swap } = usePlaybackBuffers(
    assets,
    activeClip ? { id: activeClip.id, assetId: activeClip.assetId } : null,
    waitingClip ? { id: waitingClip.id, assetId: waitingClip.assetId } : null,
  )

  const activeVideoRef = activeIsA.current ? videoRefA : videoRefB
  const waitingVideoRef = activeIsA.current ? videoRefB : videoRefA

  // Detecta seeks externos: cambios de playheadMs que NO vinieron del propio
  // <video> reportando su avance normal. Se compara contra el último valor que
  // este motor emitió; cualquier otra fuente (click en el ruler, arrastrar el
  // playhead) incrementa seekVersion y fuerza una re-sincronización de currentTime
  // incluso si el playhead se movió dentro del mismo clip. Es estado (no ref)
  // para poder usarlo como dependencia válida de useEffect sin violar las
  // reglas de hooks (un ref leído en el array de deps no es una dependencia
  // real para React y puede desalinear el tamaño del array entre renders).
  const lastEmittedPlayheadMs = useRef<number | null>(null)
  const [seekVersion, setSeekVersion] = useState(0)
  if (lastEmittedPlayheadMs.current !== null && playheadMs !== lastEmittedPlayheadMs.current) {
    lastEmittedPlayheadMs.current = playheadMs
    setSeekVersion((version) => version + 1)
  }

  // Prepara el buffer en espera en el punto de inicio de su clip, listo para
  // un corte limpio quando se le haga swap a "activo".
  useEffect(() => {
    const video = waitingVideoRef.current
    if (!video || !waitingClip || waitingBuffer.clipId !== waitingClip.id) return
    video.currentTime = waitingClip.sourceStartMs / 1000
  }, [waitingClip, waitingBuffer, waitingVideoRef])

  // Seek: alinea currentTime del video activo con el punto del clip. Se dispara
  // al cambiar de clip, al terminar de cargar su buffer, o ante un seek externo.
  useEffect(() => {
    const video = activeVideoRef.current
    if (!video || !activeClip || activeBuffer.clipId !== activeClip.id) return
    const targetSeconds = activeClip.sourceTimeMs / 1000
    if (Math.abs(video.currentTime - targetSeconds) > 0.5) {
      video.currentTime = targetSeconds
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip?.id, activeBuffer, activeVideoRef, seekVersion])

  // Play/pause del video activo; el video en espera nunca reproduce sonido/avance.
  useEffect(() => {
    waitingVideoRef.current?.pause()
    const video = activeVideoRef.current
    if (!video) return
    if (isPlaying && mode === 'clip') {
      void video.play()
    } else {
      video.pause()
    }
  }, [isPlaying, mode, activeVideoRef, waitingVideoRef])

  // Avance del playhead mientras se reproduce un clip: sigue timeupdate del
  // <video> real (fuente de verdad), no un timer propio — evita desincronía.
  useEffect(() => {
    const video = activeVideoRef.current
    if (!video || !activeClip) return

    const { offsetMs, durationMs: clipDurationMs, sourceTimeMs } = activeClip
    const clipSourceStartMs = sourceTimeMs - (playheadMs - offsetMs)
    const clipEndMs = offsetMs + clipDurationMs
    // El swap directo (sin pasar por modo 'gap') solo es válido si el siguiente
    // clip empieza exactamente donde termina el actual — si hay hueco entre
    // ambos, el efecto de avance en huecos se encarga de la transición.
    const canSwapDirectly = waitingClip !== null && waitingClip.offsetMs === clipEndMs

    function handleTimeUpdate() {
      const localMs = video!.currentTime * 1000 - clipSourceStartMs
      const nextPlayheadMs = offsetMs + localMs

      if (nextPlayheadMs >= durationMs) {
        lastEmittedPlayheadMs.current = durationMs
        onPlayheadChange(durationMs)
        onPlayingChange(false)
        return
      }

      if (nextPlayheadMs >= clipEndMs && canSwapDirectly) {
        // Mutar el ref no dispara re-render por sí solo; swap() sí es setState
        // y junto con onPlayheadChange(...) más abajo garantiza que el nuevo
        // activeIsA.current se refleje en el próximo render.
        activeIsA.current = !activeIsA.current
        swap()
      }

      lastEmittedPlayheadMs.current = nextPlayheadMs
      onPlayheadChange(nextPlayheadMs)
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => video.removeEventListener('timeupdate', handleTimeUpdate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip?.id, waitingClip?.id, durationMs, activeVideoRef, onPlayheadChange, onPlayingChange])

  // Avance en huecos sin clip: reloj de pared (pantalla vacía), nunca salta el
  // hueco — igual que un editor real, el tiempo transcurre aunque no haya imagen.
  useEffect(() => {
    if (!isPlaying || mode !== 'gap') return

    let rafId: number
    let lastTimestamp: number | null = null

    function tick(timestamp: number) {
      if (lastTimestamp === null) lastTimestamp = timestamp
      const elapsedMs = timestamp - lastTimestamp
      lastTimestamp = timestamp

      const nextPlayheadMs = playheadMs + elapsedMs
      if (nextPlayheadMs >= durationMs) {
        lastEmittedPlayheadMs.current = durationMs
        onPlayheadChange(durationMs)
        onPlayingChange(false)
        return
      }
      lastEmittedPlayheadMs.current = nextPlayheadMs
      onPlayheadChange(nextPlayheadMs)
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // playheadMs se lee solo como valor inicial del tick; incluirlo reiniciaría el rAF en cada frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, mode, durationMs, onPlayheadChange, onPlayingChange])

  return {
    videoRefA,
    videoRefB,
    activeIsA: activeIsA.current,
    activeBuffer,
    waitingBuffer,
    hasContent: mode === 'clip',
  }
}
