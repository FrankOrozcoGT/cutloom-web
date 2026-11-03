import { useEffect, useRef } from 'react'
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, VideoSampleSink, type InputAudioTrack, type InputVideoTrack } from 'mediabunny'
import { findActiveClip, getTimelineDurationMs, type ActiveClip, type Timeline } from '@domain/timeline'
import type { ProxyAsset } from '@domain/video'

interface DecodedTrackSet {
  input: Input
  videoTrack: InputVideoTrack | null
  videoSink: VideoSampleSink | null
  audioTrack: InputAudioTrack | null
  audioSink: AudioSampleSink | null
}

/** Cache de los Input/Sink de mediabunny por assetId, para no reabrir el contenedor en cada frame — se descartan los que ya no están en `proxies` (ej. el proxy se borró). */
function useDecodedTracks(proxies: Record<string, ProxyAsset>): Map<string, DecodedTrackSet> {
  const cacheRef = useRef<Map<string, DecodedTrackSet>>(new Map())

  useEffect(() => {
    const cache = cacheRef.current
    for (const assetId of cache.keys()) {
      if (!proxies[assetId]) cache.delete(assetId)
    }
  }, [proxies])

  return cacheRef.current
}

async function getOrOpenTracks(
  cache: Map<string, DecodedTrackSet>,
  assetId: string,
  proxy: ProxyAsset,
): Promise<DecodedTrackSet> {
  const existing = cache.get(assetId)
  if (existing) return existing

  const input = new Input({ source: new BlobSource(proxy.blob), formats: ALL_FORMATS })
  const videoTrack = await input.getPrimaryVideoTrack()
  const audioTrack = await input.getPrimaryAudioTrack()
  const entry: DecodedTrackSet = {
    input,
    videoTrack,
    videoSink: videoTrack ? new VideoSampleSink(videoTrack) : null,
    audioTrack,
    audioSink: audioTrack ? new AudioSampleSink(audioTrack) : null,
  }
  cache.set(assetId, entry)
  return entry
}

async function paintFrame(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  entry: DecodedTrackSet,
  active: ActiveClip,
): Promise<void> {
  if (!entry.videoSink || !entry.videoTrack) return
  const sample = await entry.videoSink.getSample(active.sourceTimeMs / 1000)
  if (!sample) return
  try {
    if (canvas.width !== sample.displayWidth || canvas.height !== sample.displayHeight) {
      canvas.width = sample.displayWidth
      canvas.height = sample.displayHeight
    }
    sample.draw(context, 0, 0, canvas.width, canvas.height)
  } finally {
    sample.close()
  }
}

async function buildAudioBuffer(context: AudioContext, entry: DecodedTrackSet, active: ActiveClip): Promise<AudioBuffer | null> {
  if (!entry.audioSink || !entry.audioTrack) return null
  const remainingSourceMs = active.clip.sourceStartMs + active.clip.durationMs - active.sourceTimeMs
  const endSeconds = (active.sourceTimeMs + remainingSourceMs) / 1000
  const buffers: AudioBuffer[] = []
  for await (const sample of entry.audioSink.samples(active.sourceTimeMs / 1000, endSeconds)) {
    try {
      buffers.push(sample.toAudioBuffer())
    } finally {
      sample.close()
    }
  }
  if (buffers.length === 0) return null

  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0)
  const merged = context.createBuffer(buffers[0].numberOfChannels, totalLength, buffers[0].sampleRate)
  let offset = 0
  for (const buffer of buffers) {
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      merged.getChannelData(channel).set(buffer.getChannelData(channel), offset)
    }
    offset += buffer.length
  }
  return merged
}

interface UseTimelineRendererArgs {
  timeline: Timeline
  proxies: Record<string, ProxyAsset>
  playheadMs: number
  /** Incrementado SOLO ante un seek explícito del usuario (clic en el timeline/subtítulo) — nunca por el propio motor reportando su avance normal. */
  seekVersion: number
  isPlaying: boolean
  onPlayheadChange: (ms: number) => void
  onEnded: () => void
  onLoadingChange: (isLoading: boolean) => void
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}

/**
 * Motor de reproducción. Mientras isPlaying, el audio es el reloj maestro:
 * se decodifica y arranca el clip activo una vez por sesión, y
 * AudioContext.currentTime (no un contador de requestAnimationFrame) es la
 * fuente de verdad del tiempo transcurrido dentro de esa sesión.
 *
 * Una sesión de audio (startAudioSession) arranca por exactamente tres
 * eventos discretos, cada uno detectado sin ambigüedad:
 * - isPlaying pasa a true (useEffect, dep isPlaying).
 * - seekVersion cambia — comando explícito del usuario (useEffect, dep seekVersion).
 * - el loop de render, que corre en cada frame, cruza a un clip con id
 *   distinto al de la sesión vigente (comparación de id, no de magnitud).
 * Nunca se infiere un seek comparando valores de playheadMs contra un
 * umbral: o es uno de estos tres eventos reales, o no pasa nada.
 *
 * El pintado de frames corre en su propio loop de requestAnimationFrame,
 * separado de la decisión de qué hora es: no inicia la siguiente
 * decodificación hasta que la anterior terminó (flag `rendering`), así
 * nunca se encola trabajo de decode más rápido de lo que puede completarse.
 */
export function useTimelineRenderer({
  timeline,
  proxies,
  playheadMs,
  seekVersion,
  isPlaying,
  onPlayheadChange,
  onEnded,
  onLoadingChange,
  canvasRef,
}: UseTimelineRendererArgs) {
  const tracks = useDecodedTracks(proxies)

  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null)
  // Ancla para derivar el tiempo real transcurrido desde AudioContext.currentTime:
  // playheadMs del timeline que correspondía al instante en que arrancó la sesión de audio vigente.
  const playbackAnchorRef = useRef<{ contextTimeAtStart: number; playheadMsAtStart: number } | null>(null)
  // Id del clip que sirvió la sesión de audio vigente — permite al loop de
  // render detectar "cruzamos a otro clip" sin comparar ningún número.
  const sessionClipIdRef = useRef<string | null>(null)
  const sessionTokenRef = useRef(0)

  const playheadMsRef = useRef(playheadMs)
  playheadMsRef.current = playheadMs

  const renderingRef = useRef(false)
  const rafIdRef = useRef<number | null>(null)

  function getAudioContext(): AudioContext {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume()
    }
    return audioContextRef.current
  }

  function stopAudio() {
    audioSourceRef.current?.stop()
    audioSourceRef.current?.disconnect()
    audioSourceRef.current = null
    playbackAnchorRef.current = null
    sessionClipIdRef.current = null
  }

  function currentPlayheadMs(): number {
    if (!isPlaying || !playbackAnchorRef.current || !audioContextRef.current) return playheadMsRef.current
    const elapsedSeconds = audioContextRef.current.currentTime - playbackAnchorRef.current.contextTimeAtStart
    return playbackAnchorRef.current.playheadMsAtStart + elapsedSeconds * 1000
  }

  // Arranca una sesión de audio nueva a partir de anchorMs, para el clip
  // activo en ese punto. Único lugar que decodifica/arranca audio — tanto
  // el useEffect de abajo (isPlaying/seekVersion) como el loop de render
  // (cruce de clip) pasan por acá.
  function startAudioSession(anchorMs: number) {
    const active = findActiveClip(timeline, anchorMs)
    const proxy = active ? proxies[active.clip.assetId] : null
    stopAudio()
    if (!active || !proxy) return

    sessionClipIdRef.current = active.clip.id
    const token = ++sessionTokenRef.current
    getAudioContext()
    onLoadingChange(true)

    void getOrOpenTracks(tracks, active.clip.assetId, proxy)
      .then(async (entry) => {
        if (sessionTokenRef.current !== token) return
        const audioContext = getAudioContext()
        const buffer = await buildAudioBuffer(audioContext, entry, active)
        if (sessionTokenRef.current !== token) return

        playbackAnchorRef.current = { contextTimeAtStart: audioContext.currentTime, playheadMsAtStart: anchorMs }

        if (!buffer) return
        const source = audioContext.createBufferSource()
        source.buffer = buffer
        source.connect(audioContext.destination)
        source.start()
        audioSourceRef.current = source
      })
      .catch((e) => console.error('[audio] failed', e))
      .finally(() => {
        if (sessionTokenRef.current === token) onLoadingChange(false)
      })
  }

  // Dispara la sesión de audio al pasar a reproducir o ante un seek
  // explícito. Deliberadamente sin playheadMs en deps — ver docstring.
  useEffect(() => {
    if (!isPlaying) {
      stopAudio()
      sessionTokenRef.current += 1
      return
    }
    startAudioSession(playheadMsRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, seekVersion, timeline, proxies, tracks])

  // Loop de render: una sola iteración en vuelo a la vez. También es quien
  // detecta el cruce natural a otro clip mientras reproduce (comparando el
  // id del clip activo contra sessionClipIdRef) y dispara una sesión nueva.
  useEffect(() => {
    function tick() {
      rafIdRef.current = requestAnimationFrame(tick)

      const nowMs = currentPlayheadMs()
      const durationMs = getTimelineDurationMs(timeline)
      if (isPlaying && nowMs >= durationMs) {
        onEnded()
        return
      }
      if (isPlaying) onPlayheadChange(nowMs)

      const active = findActiveClip(timeline, nowMs)
      if (isPlaying && active && active.clip.id !== sessionClipIdRef.current) {
        startAudioSession(nowMs)
      }

      if (renderingRef.current) return

      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      const proxy = active ? proxies[active.clip.assetId] : null

      if (!active || !proxy) {
        if (canvas && context) {
          context.fillStyle = 'black'
          context.fillRect(0, 0, canvas.width, canvas.height)
        }
        return
      }
      if (!canvas || !context) return

      renderingRef.current = true
      void getOrOpenTracks(tracks, active.clip.assetId, proxy)
        .then((entry) => paintFrame(canvas, context, entry, active))
        .catch((e) => console.error('[renderer] paint failed', e))
        .finally(() => {
          renderingRef.current = false
        })
    }

    rafIdRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, proxies, tracks, isPlaying, canvasRef])

  useEffect(() => {
    return () => {
      stopAudio()
      void audioContextRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
