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
 * Motor de reproducción del timeline compuesto. Reloj único: un
 * requestAnimationFrame de pared avanza playheadMs mientras isPlaying es
 * true, sin importar si el instante actual cae en un clip o en un hueco —
 * los <video> nunca son la fuente de verdad del tiempo, solo la siguen.
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

  // El reloj de abajo necesita distinguir "el playhead cambió porque yo lo
  // reporté" de "alguien más lo movió" (seek: clic en el timeline, en un
  // subtítulo) para saber cuándo reiniciar su punto de partida. Detectar eso
  // con un efecto separado (comparar playheadMs en un useEffect, forzar un
  // "seekVersion" que recrea el efecto del reloj) tiene una carrera real: el
  // rAF pendiente del reloj viejo puede ejecutarse entre el seek y el
  // re-render que recrearía el efecto, reportando su propio avance y
  // pisando el seek antes de que el nuevo efecto tome el control — no es
  // parcheable porque el origen es la distancia de un ciclo de render entre
  // "el estado cambió" y "el efecto reaccionó".
  //
  // Por eso lastKnownPlayheadRef se actualiza EN CADA RENDER (no en un
  // efecto): synchronously, en el mismo tick de JS en que React procesa el
  // nuevo playheadMs. tick() la lee en cada frame y, si no coincide con lo
  // que el propio tick() reportó la última vez, sabe sin ambigüedad que hubo
  // un seek externo y se realinea ahí mismo — sin esperar a que el efecto se
  // vuelva a montar.
  const lastKnownPlayheadRef = useRef(playheadMs)
  const lastInternalPlayheadRef = useRef<number | null>(null)
  lastKnownPlayheadRef.current = playheadMs

  // Tras un seek grande, el <video> real tarda en decodificar hasta el nuevo
  // punto (busca el keyframe más cercano) — el frame en pantalla queda
  // congelado durante ese lapso. Si el reloj de pared ignora eso, la línea
  // del timeline sigue avanzando como si el video ya estuviera ahí,
  // desincronizándose del frame real que se ve. isSeekingRef lo marcan los
  // listeners 'seeking'/'seeked' del <video> activo (más abajo) y tick() lo
  // usa para pausar su propio avance mientras el video sigue buscando.
  const isSeekingRef = useRef(false)
  const [isSeeking, setIsSeeking] = useState(false)

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

  // Alinea currentTime del video activo con el punto del clip que le
  // corresponde según el playhead. Única fuente de "dónde debe estar
  // parado" el <video> — cubre seeks, cambios de clip y el avance normal.
  useEffect(() => {
    if (!hasActiveVideo) return
    const video = activeVideoRef.current
    if (!video || !activeClip) return
    // Si ya hay un seek en curso, escribir currentTime de nuevo reinicia la
    // búsqueda del keyframe desde cero antes de que la anterior termine —
    // en archivos grandes eso nunca converge (spinner de carga indefinido).
    // Se espera a que 'seeked' resuelva antes de corregir drift de nuevo.
    if (isSeekingRef.current) return
    const targetSeconds = activeClip.sourceTimeMs / 1000
    if (Math.abs(video.currentTime - targetSeconds) > 0.2) {
      video.currentTime = targetSeconds
    }
  }, [hasActiveVideo, activeClip, activeVideoRef, playheadMs])

  // Mientras el <video> activo está resolviendo un seek grande (buscando el
  // keyframe, decodificando), el reloj de pared deja de acumular tiempo —
  // ver isSeekingRef arriba. También escucha 'ended': si el archivo fuente
  // termina antes de que el reloj de pared cruce el borde del clip (deriva
  // de precisión, redondeo), el <video> se detiene solo — sin este listener
  // quedaría congelado y mudo aunque el reloj de pared siga corriendo,
  // porque nada más vuelve a llamar .play() sobre él.
  useEffect(() => {
    if (!hasActiveVideo) return
    const video = activeVideoRef.current
    if (!video) return
    isSeekingRef.current = false
    setIsSeeking(false)
    function handleSeeking() {
      isSeekingRef.current = true
      setIsSeeking(true)
    }
    function handleSeeked() {
      isSeekingRef.current = false
      setIsSeeking(false)
    }
    function handleEnded() {
      if (isPlaying) void video?.play().catch(() => {})
    }
    video.addEventListener('seeking', handleSeeking)
    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('ended', handleEnded)
    return () => {
      video.removeEventListener('seeking', handleSeeking)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('ended', handleEnded)
    }
  }, [hasActiveVideo, activeVideoRef, isPlaying])

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
  useEffect(() => {
    waitingVideoRef.current?.pause()
    if (!hasActiveVideo) return
    const video = activeVideoRef.current
    if (!video) return
    if (isPlaying && mode === 'clip') {
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [isPlaying, mode, hasActiveVideo, activeVideoRef, waitingVideoRef])

  // Reloj de pared: única fuente de avance del playhead durante la
  // reproducción, dentro o fuera de un clip. Un seek externo (clic en el
  // timeline, en un subtítulo) se detecta DENTRO de tick(), comparando
  // contra lastKnownPlayheadRef en cada frame — no recreando el efecto vía
  // una dependencia de seek separada, que dejaría una ventana de un ciclo de
  // render donde un tick() ya agendado podía reportar su propio avance y
  // pisar el seek.
  useEffect(() => {
    if (!isPlaying || mode === 'ended') return

    let rafId: number
    let lastTimestamp: number | null = null
    let currentPlayheadMs = playheadMs
    lastInternalPlayheadRef.current = currentPlayheadMs

    function tick(timestamp: number) {
      // Si el playhead real (prop, actualizado cada render) no coincide con
      // lo último que este mismo reloj reportó, alguien más lo movió: se
      // realinea el punto de partida en vez de seguir sumando sobre el
      // avance viejo.
      if (lastKnownPlayheadRef.current !== lastInternalPlayheadRef.current) {
        currentPlayheadMs = lastKnownPlayheadRef.current
        lastTimestamp = null
      }

      if (lastTimestamp === null) lastTimestamp = timestamp
      const elapsedMs = timestamp - lastTimestamp
      lastTimestamp = timestamp

      // No acumular mientras el <video> activo sigue buscando el frame del
      // seek — si no, el playhead reportado se adelanta al frame que
      // realmente se ve en pantalla.
      if (isSeekingRef.current) {
        rafId = requestAnimationFrame(tick)
        return
      }

      currentPlayheadMs = Math.min(currentPlayheadMs + elapsedMs, durationMs)
      lastInternalPlayheadRef.current = currentPlayheadMs
      lastKnownPlayheadRef.current = currentPlayheadMs
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
    // reloj): incluirlo en deps reiniciaría lastTimestamp en cada frame. Los
    // seeks se detectan dentro de tick() vía lastKnownPlayheadRef, no
    // recreando este efecto.
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
