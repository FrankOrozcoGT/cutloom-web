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

  // Mientras el <video> activo está resolviendo un seek grande (buscando el
  // keyframe, decodificando), el reloj de pared deja de acumular tiempo —
  // ver isSeekingRef arriba.
  //
  // 'seeked' por sí solo dispara apenas el navegador reposiciona el punto de
  // lectura, pero no garantiza que haya frames futuros ya decodificados —
  // arrancar el play ahí mismo puede frenar de nuevo un instante después
  // (micro-freeze). Se espera además a readyState >= HAVE_FUTURE_DATA (nivel
  // 3: el frame actual Y el siguiente ya están listos), el mismo colchón que
  // un reproductor como YouTube exige antes de soltar el loading — con
  // contenido local (Blob, sin red) esto se resuelve en milisegundos, pero
  // sigue siendo la garantía correcta en vez de asumirla por el evento.
  useEffect(() => {
    const videoElement = activeVideoRef.current
    if (!videoElement) return
    const video: HTMLVideoElement = videoElement

    function hasEnoughBuffered(): boolean {
      return video.readyState >= video.HAVE_FUTURE_DATA
    }

    function markReady() {
      isSeekingRef.current = false
      setIsSeeking(false)
    }

    function handleSeeking() {
      isSeekingRef.current = true
      setIsSeeking(true)
    }

    function handleReadyStateCheck() {
      if (hasEnoughBuffered()) markReady()
    }

    video.addEventListener('seeking', handleSeeking)
    video.addEventListener('seeked', handleReadyStateCheck)
    video.addEventListener('canplay', handleReadyStateCheck)
    video.addEventListener('progress', handleReadyStateCheck)
    return () => {
      video.removeEventListener('seeking', handleSeeking)
      video.removeEventListener('seeked', handleReadyStateCheck)
      video.removeEventListener('canplay', handleReadyStateCheck)
      video.removeEventListener('progress', handleReadyStateCheck)
    }
  }, [activeVideoRef])

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

  // El clip activo cambió (ej. clic en un subtítulo) pero su buffer todavía
  // no terminó de cargar la blob URL — el <video> no debe mostrar nada del
  // clip anterior ni intentar reproducir sin fuente; se trata como loading,
  // igual que un seek en curso, hasta que activeBuffer.clipId lo alcance.
  const isBufferLoading = !!activeClip && activeBuffer.clipId !== activeClip.id

  return {
    videoRefA,
    videoRefB,
    bufferA,
    bufferB,
    activeIsA: lastActiveIsA,
    hasContent: mode === 'clip',
    isSeeking: isSeeking || isBufferLoading,
  }
}
