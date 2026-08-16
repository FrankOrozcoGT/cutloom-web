import { useEffect, useRef } from 'react'
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
 * Motor de reproducción del timeline compuesto. Reloj único: un
 * requestAnimationFrame de pared avanza playheadMs mientras isPlaying es
 * true, sin importar si el instante actual cae en un clip o en un hueco —
 * los <video> nunca son la fuente de verdad del tiempo, solo la siguen.
 *
 * El diseño anterior usaba dos relojes distintos (timeupdate del <video>
 * dentro de un clip, un rAF propio en los huecos) que había que coser en
 * cada transición clip↔hueco↔clip con swaps manuales de qué <video> es "el
 * activo" — cada transición era un caso especial nuevo y cada uno arrastraba
 * su propio bug (parpadeo al saltar entre subtítulos, reproducción trabada
 * al cruzar un hueco). Con un solo reloj no hay nada que coser: cada frame
 * simplemente pregunta "qué correspondería ahora" (computePlaybackSnapshot)
 * y sincroniza el DOM a eso.
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

  // Qué slot pide qué clip, y cuál de los dos es "el activo" para efectos de
  // reproducción, se deciden con el MISMO valor de rol (lastActiveIsA) dentro
  // de este render — nunca se mezcla un rol con buffers pedidos bajo otro
  // rol distinto. Antes se pedían los buffers con el rol viejo pero se
  // exponía activeBuffer/activeVideoRef ya con el rol "corregido" de este
  // mismo render: esos dos podían quedar desalineados un frame, así que
  // activeBuffer.url terminaba siendo la URL que el OTRO slot estaba
  // cargando/reemplazando ese instante — de ahí el ERR_FILE_NOT_FOUND al
  // asignarla a un <video src>. El rol solo se corrige para el PRÓXIMO
  // render, después de leer bufferA/bufferB ya resueltos con este rol.
  const lastActiveIsA = activeIsA.current
  const wantsA = lastActiveIsA
    ? (activeClip ? { id: activeClip.id, assetId: activeClip.assetId } : null)
    : (waitingClip ? { id: waitingClip.id, assetId: waitingClip.assetId } : null)
  const wantsB = lastActiveIsA
    ? (waitingClip ? { id: waitingClip.id, assetId: waitingClip.assetId } : null)
    : (activeClip ? { id: activeClip.id, assetId: activeClip.assetId } : null)

  const { bufferA, bufferB } = usePlaybackBuffers(assets, wantsA, wantsB)

  const activeBuffer = lastActiveIsA ? bufferA : bufferB
  const waitingBuffer = lastActiveIsA ? bufferB : bufferA
  const activeVideoRef = lastActiveIsA ? videoRefA : videoRefB
  const waitingVideoRef = lastActiveIsA ? videoRefB : videoRefA

  // Recién acá se corrige el rol, para el próximo render: si el slot activo
  // ya no tiene cargado activeClip pero el que estaba en espera sí, el rol
  // cambia de cara al siguiente ciclo.
  if (activeClip && activeBuffer.clipId !== activeClip.id && waitingBuffer.clipId === activeClip.id) {
    activeIsA.current = !lastActiveIsA
  }

  // Precarga el buffer en espera en el punto de inicio de su clip, listo para
  // un corte limpio cuando pase a ser el activo.
  useEffect(() => {
    const video = waitingVideoRef.current
    if (!video || !waitingClip || waitingBuffer.clipId !== waitingClip.id) return
    video.currentTime = waitingClip.sourceStartMs / 1000
  }, [waitingClip, waitingBuffer, waitingVideoRef])

  // Alinea currentTime del video activo con el punto del clip que le
  // corresponde según el playhead. Única fuente de "dónde debe estar
  // parado" el <video> — cubre seeks, cambios de clip y el avance normal.
  useEffect(() => {
    const video = activeVideoRef.current
    if (!video || !activeClip || activeBuffer.clipId !== activeClip.id) return
    const targetSeconds = activeClip.sourceTimeMs / 1000
    if (Math.abs(video.currentTime - targetSeconds) > 0.2) {
      video.currentTime = targetSeconds
    }
  }, [activeClip, activeBuffer, activeVideoRef, playheadMs])

  // Si el timeline indica un clip activo pero su asset ya no existe (se borró
  // el VideoAsset original mientras se reproducía), usePlaybackBuffers deja el
  // buffer vacío — acá se detiene la reproducción en vez de seguir "sonando"
  // sobre un <video> sin fuente.
  useEffect(() => {
    if (activeClip && activeBuffer.clipId === null && isPlaying) {
      onPlayingChange(false)
    }
  }, [activeClip, activeBuffer.clipId, isPlaying, onPlayingChange])

  // Play/pause del video activo; el video en espera nunca reproduce sonido.
  useEffect(() => {
    waitingVideoRef.current?.pause()
    const video = activeVideoRef.current
    if (!video) return
    if (isPlaying && mode === 'clip') {
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [isPlaying, mode, activeVideoRef, waitingVideoRef])

  // Reloj de pared: única fuente de avance del playhead durante la
  // reproducción, dentro o fuera de un clip. Se relee mode/durationMs en
  // cada frame vía closures frescas (el efecto se re-crea en cada cambio de
  // playheadMs), así que cruzar de un clip a un hueco o a otro clip no
  // requiere ningún caso especial: el próximo frame simplemente ve el nuevo
  // snapshot y sigue.
  useEffect(() => {
    if (!isPlaying || mode === 'ended') return

    let rafId: number
    let lastTimestamp: number | null = null
    // Acumula sobre el propio avance del reloj, no sobre el playheadMs
    // capturado al montar el efecto — si no, cada frame recalcula
    // "playheadMs inicial + delta de ESTE frame" en vez de sumar el tiempo
    // transcurrido total, y el playhead reportado queda pegado cerca del
    // valor inicial en vez de progresar.
    let currentPlayheadMs = playheadMs

    function tick(timestamp: number) {
      if (lastTimestamp === null) lastTimestamp = timestamp
      const elapsedMs = timestamp - lastTimestamp
      lastTimestamp = timestamp

      currentPlayheadMs = Math.min(currentPlayheadMs + elapsedMs, durationMs)
      onPlayheadChange(currentPlayheadMs)
      if (currentPlayheadMs >= durationMs) {
        onPlayingChange(false)
        return
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // Solo el primer valor de playheadMs importa (punto de partida del
    // reloj): incluirlo en deps reiniciaría lastTimestamp en cada frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, mode, durationMs, onPlayheadChange, onPlayingChange])

  return {
    videoRefA,
    videoRefB,
    bufferA,
    bufferB,
    activeIsA: lastActiveIsA,
    hasContent: mode === 'clip',
  }
}
