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
 * Motor de reproducción del timeline compuesto. Máquina de dos modos
 * mutuamente excluyentes, nunca simultáneos, para evitar que dos escritores
 * compitan por la misma variable (playheadMs):
 *
 * - Modo reproducción: el <video> activo reproduce solo (su propio decoder
 *   de audio+video, sincronizado internamente por el navegador). Nadie
 *   escribe currentTime. El evento nativo 'timeupdate' es la única fuente
 *   que mueve playheadMs — solo lectura, nunca comando hacia el video.
 * - Modo seek: un comando externo (entrar a un clip nuevo, clic del usuario
 *   en el timeline/subtítulo) escribe video.currentTime una vez. Desde ese
 *   instante y hasta que el navegador confirma 'seeked', se activa un lock
 *   (isSeekingRef) que descarta cualquier 'timeupdate' que llegue mientras
 *   tanto — sin el lock, un timeupdate ya en tránsito desde antes del seek
 *   puede reportarse después y pisar el valor que el usuario acaba de fijar.
 *
 * El único tramo sin ningún <video> real reproduciendo es un hueco entre
 * clips ('gap'): ahí, y solo ahí, un requestAnimationFrame propio avanza el
 * playhead hasta el próximo clip o el final del timeline.
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

  const [isSeeking, setIsSeeking] = useState(false)
  // Lock de exclusión mutua entre 'timeupdate' (video → playhead) y un seek
  // en curso (comando → video). Se lee sincrónicamente dentro del listener,
  // no como estado de React, porque debe tener efecto en el mismo tick en
  // que se activa — un setState tarda un render en propagarse, dejando una
  // ventana donde un timeupdate en tránsito todavía podría colarse.
  const isSeekingRef = useRef(false)

  const snapshot = computePlaybackSnapshot(timeline, playheadMs)
  const { activeClip, waitingClip, durationMs, mode } = snapshot

  const {
    active: activeBuffer,
    waiting: waitingBuffer,
    activeIsSlotA,
  } = usePlaybackBuffers(
    assets,
    activeClip ? { id: activeClip.id, assetId: activeClip.assetId } : null,
    waitingClip ? { id: waitingClip.id, assetId: waitingClip.assetId } : null,
  )

  const activeVideoRef = activeIsSlotA ? videoRefA : videoRefB
  const waitingVideoRef = activeIsSlotA ? videoRefB : videoRefA
  const hasActiveVideo = activeClip !== null && activeBuffer.clipId === activeClip.id

  // Precarga el buffer en espera en el punto de inicio de su clip, listo para
  // un corte limpio cuando pase a ser el activo.
  useEffect(() => {
    const video = waitingVideoRef.current
    if (!video || !waitingClip || waitingBuffer.clipId !== waitingClip.id) return
    video.currentTime = waitingClip.sourceStartMs / 1000
  }, [waitingClip, waitingBuffer, waitingVideoRef])

  // Comando de seek hacia el <video> activo: entrar a un clip nuevo, o un
  // seek explícito del usuario (clic en el timeline/subtítulo) dentro del
  // clip que ya está activo. Se distingue de la deriva normal de
  // reproducción por la magnitud del salto (>0.75s = comando real, no ruido
  // de latencia entre el evento nativo y el render de React). Activa el
  // lock ANTES de escribir currentTime, para que ningún 'timeupdate' que
  // llegue mientras el seek resuelve pueda pisar este valor.
  useEffect(() => {
    if (!hasActiveVideo || !activeClip) return
    const video = activeVideoRef.current
    if (!video) return
    // activeClip es un objeto nuevo en cada render (computePlaybackSnapshot
    // lo reconstruye), así que este efecto se re-ejecuta en cada frame
    // mientras reproduce, no solo al cambiar de clip. Sin este guard, si ya
    // hay un seek en curso (isSeekingRef true) y el video todavía no llegó
    // al punto pedido, cada re-ejecución reescribe currentTime de nuevo
    // sobre el seek anterior — reiniciando la búsqueda antes de que el
    // navegador la termine, así que nunca converge.
    if (isSeekingRef.current) return
    const targetSeconds = activeClip.sourceTimeMs / 1000
    if (Math.abs(video.currentTime - targetSeconds) > 0.75) {
      isSeekingRef.current = true
      setIsSeeking(true)
      video.currentTime = targetSeconds
    }
  }, [hasActiveVideo, activeClip, activeVideoRef])

  // El <video> activo es la fuente de verdad del tiempo dentro de un clip:
  // su propio 'timeupdate' nativo es lo único que mueve playheadMs mientras
  // mode === 'clip' Y no hay un seek en curso (lock arriba). 'seeked'
  // confirma que el navegador terminó de resolver el comando y libera el
  // lock. 'ended' relanza .play() si el archivo fuente termina antes de que
  // el clip del timeline debería terminar (deriva de precisión/redondeo),
  // para no quedar congelado y mudo.
  useEffect(() => {
    if (!hasActiveVideo || !activeClip) return
    const videoElement = activeVideoRef.current
    if (!videoElement) return
    const video: HTMLVideoElement = videoElement

    function handleTimeUpdate() {
      if (!activeClip) return
      if (isSeekingRef.current) return
      const elapsedInClipMs = video.currentTime * 1000 - activeClip.sourceStartMs
      const clampedMs = Math.min(Math.max(0, elapsedInClipMs), activeClip.durationMs)
      onPlayheadChange(activeClip.offsetMs + clampedMs)
    }
    function handleSeeking() {
      isSeekingRef.current = true
      setIsSeeking(true)
    }
    function handleSeeked() {
      isSeekingRef.current = false
      setIsSeeking(false)
    }
    function handleEnded() {
      if (isPlaying) void video.play().catch(() => {})
    }
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('seeking', handleSeeking)
    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('ended', handleEnded)
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('seeking', handleSeeking)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('ended', handleEnded)
    }
  }, [hasActiveVideo, activeClip, activeVideoRef, isPlaying, onPlayheadChange])

  // Si el timeline indica un clip activo pero su asset ya no existe (se borró
  // el VideoAsset original mientras se reproducía), usePlaybackBuffers deja el
  // buffer vacío — acá se detiene la reproducción en vez de seguir "sonando"
  // sobre un <video> sin fuente.
  useEffect(() => {
    if (activeClip && !hasActiveVideo && activeBuffer.clipId === null && isPlaying) {
      onPlayingChange(false)
    }
  }, [activeClip, hasActiveVideo, activeBuffer.clipId, isPlaying, onPlayingChange])

  // Play/pause del video activo; el video en espera nunca reproduce sonido.
  // En un hueco (mode !== 'clip') no hay activeClip, así que hasActiveVideo
  // es false — pero el <video> que reproducía el clip anterior sigue
  // existiendo y con su audio corriendo si nadie le ordena pausar. Por eso
  // se pausan explícitamente AMBOS slots físicos (A y B) cuando no
  // corresponde reproducir, en vez de depender de activeVideoRef, que deja
  // de apuntar a "el video que hay que pausar" apenas hasActiveVideo es
  // false.
  useEffect(() => {
    if (!isPlaying || mode !== 'clip' || !hasActiveVideo) {
      videoRefA.current?.pause()
      videoRefB.current?.pause()
      return
    }
    waitingVideoRef.current?.pause()
    const video = activeVideoRef.current
    if (!video) return
    void video.play().catch(() => {})
  }, [isPlaying, mode, hasActiveVideo, activeVideoRef, waitingVideoRef])

  // Único tramo sin ningún <video> real reproduciendo: un hueco entre clips.
  // Ahí, y solo ahí, un reloj de pared propio avanza el playhead hasta que
  // aparece el próximo clip (que pasa a ser hasActiveVideo=true y el efecto
  // de arriba toma el control) o se llega al final del timeline.
  useEffect(() => {
    if (!isPlaying || mode !== 'gap') return

    let rafId: number
    let lastTimestamp: number | null = null
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
    // reloj de este hueco específico): incluirlo en deps reiniciaría
    // lastTimestamp en cada frame. Este efecto se remonta solo al entrar o
    // salir de mode 'gap', o al pausar/reanudar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, mode, durationMs, onPlayheadChange, onPlayingChange])

  const bufferA = activeIsSlotA ? activeBuffer : waitingBuffer
  const bufferB = activeIsSlotA ? waitingBuffer : activeBuffer

  return {
    videoRefA,
    videoRefB,
    bufferA,
    bufferB,
    activeIsA: activeIsSlotA,
    hasContent: mode === 'clip',
    isSeeking,
  }
}
