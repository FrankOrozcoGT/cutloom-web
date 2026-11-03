import { useEffect } from 'react'
import { getTimelineDurationMs, type Timeline } from '@domain/timeline'
import { SUBTITLE_STYLE, type SubtitleSegment } from '@domain/subtitles'
import type { ProxyAsset } from '@domain/video'
import { usePlaybackEngine } from './usePlaybackEngine'

interface TimelinePlayerProps {
  timeline: Timeline
  /** Proxies livianos del proyecto, indexados por videoAssetId — la reproducción en vivo siempre trabaja sobre estos, nunca sobre los VideoAsset originales. */
  proxies: Record<string, ProxyAsset>
  playheadMs: number
  /** Incrementado SOLO ante un seek explícito del usuario (ver useTimeline.seekTo) — nunca por el propio motor reportando su avance normal. Opcional: sin seeks posibles (ej. ShortCard), queda en 0. */
  seekVersion?: number
  isPlaying: boolean
  onPlayheadChange: (ms: number) => void
  onPlayingChange: (isPlaying: boolean) => void
  /** Segmentos de subtítulos ya en tiempo de timeline (no requieren remapeo por clip). */
  segments?: SubtitleSegment[]
  /** Notifica qué segmento quedó bajo el playhead, para resaltarlo en el listado de edición. */
  onActiveSegmentChange?: (segmentId: string | null) => void
  /** Click explícito del usuario sobre el subtítulo superpuesto: abrir/enfocar el listado de edición. */
  onSegmentClick?: (segmentId: string) => void
  /** Reemplaza el aspect-video/bordes por defecto — usado para componer un fondo 9:16 cover+blur detrás de una instancia 'normal' en primer plano (ver ShortCard). */
  containerClassName?: string
  /** Reemplaza object-contain por defecto en el canvas — 'cover' para la capa de fondo desenfocada. */
  videoObjectFit?: 'contain' | 'cover'
  /** object-position horizontal en % (0 = borde izquierdo visible, 50 = centrado, 100 = borde derecho visible) — solo relevante con videoObjectFit='cover', donde recorta contenido a los costados. Default 50. */
  objectPositionX?: number
}

function findActiveSegment(playheadMs: number, segments: SubtitleSegment[] | undefined): SubtitleSegment | null {
  if (!segments) return null
  return segments.find((s) => playheadMs >= s.startMs && playheadMs < s.endMs) ?? null
}

/**
 * Componente puramente presentacional: renderiza el <canvas> donde
 * usePlaybackEngine pinta el frame actual (decodificado bajo demanda con
 * WebCodecs vía mediabunny, siempre sobre los proxies) y superpone
 * subtítulos. No hay ningún elemento <video> del DOM involucrado.
 */
export function TimelinePlayer({
  timeline,
  proxies,
  playheadMs,
  seekVersion = 0,
  isPlaying,
  onPlayheadChange,
  onPlayingChange,
  segments,
  onActiveSegmentChange,
  onSegmentClick,
  containerClassName,
  videoObjectFit = 'contain',
  objectPositionX = 50,
}: TimelinePlayerProps) {
  const { canvasRef, hasContent, isLoading } = usePlaybackEngine({
    timeline,
    proxies,
    playheadMs,
    seekVersion,
    isPlaying,
    onPlayheadChange,
    onPlayingChange,
  })

  const durationMs = getTimelineDurationMs(timeline)
  const isWithinTimelineRange = playheadMs >= 0 && playheadMs < durationMs
  const activeSegment = findActiveSegment(playheadMs, segments)

  useEffect(() => {
    onActiveSegmentChange?.(activeSegment?.id ?? null)
  }, [activeSegment?.id, onActiveSegmentChange])

  const objectFitClass = videoObjectFit === 'cover' ? 'object-cover' : 'object-contain'

  return (
    <div
      className={
        containerClassName ??
        'relative flex aspect-video max-h-full w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-bg'
      }
      // container-type: size habilita las unidades cqh/cqw de abajo, que
      // dimensionan el subtítulo como fracción real del tamaño del video —
      // los mismos ratios (SUBTITLE_STYLE) que usa el compositor del render
      // para quemarlo en el archivo final, así el preview coincide con el
      // resultado en vez de tener cada uno su propio tamaño fijo arbitrario.
      style={{ containerType: 'size' }}
    >
      {!hasContent && (
        <span className="text-sm text-text-muted">
          {isWithinTimelineRange ? '' : 'Sin contenido en esta posición'}
        </span>
      )}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${objectFitClass}`}
        style={{ visibility: hasContent ? 'visible' : 'hidden', objectPosition: `${objectPositionX}% center` }}
      />
      {hasContent && isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}
      {hasContent && activeSegment && (
        <div
          className="absolute inset-x-0 flex justify-center"
          style={{ bottom: `${SUBTITLE_STYLE.bottomMarginRatio * 100}cqh` }}
        >
          <button
            type="button"
            onClick={() => onSegmentClick?.(activeSegment.id)}
            className="line-clamp-2 rounded text-center font-bold text-white"
            style={{
              maxWidth: `${SUBTITLE_STYLE.maxWidthRatio * 100}cqw`,
              fontSize: `${SUBTITLE_STYLE.fontSizeRatio * 100}cqh`,
              lineHeight: SUBTITLE_STYLE.lineHeightRatio,
              WebkitTextStroke: '0.06em black',
              paintOrder: 'stroke fill',
            }}
          >
            {activeSegment.text}
          </button>
        </div>
      )}
    </div>
  )
}
