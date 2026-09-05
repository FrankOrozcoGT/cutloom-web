import { useEffect } from 'react'
import { getTimelineDurationMs, type Timeline } from '@domain/timeline'
import type { SubtitleSegment } from '@domain/subtitles'
import type { VideoAsset } from '@domain/video'
import { usePlaybackEngine } from './usePlaybackEngine'

interface TimelinePlayerProps {
  timeline: Timeline
  assets: Record<string, VideoAsset>
  playheadMs: number
  isPlaying: boolean
  onPlayheadChange: (ms: number) => void
  onPlayingChange: (isPlaying: boolean) => void
  /** Segmentos de subtítulos ya en tiempo de timeline (no requieren remapeo por clip). */
  segments?: SubtitleSegment[]
  /** Notifica qué segmento quedó bajo el playhead, para resaltarlo en el listado de edición. */
  onActiveSegmentChange?: (segmentId: string | null) => void
  /** Click explícito del usuario sobre el subtítulo superpuesto: abrir/enfocar el listado de edición. */
  onSegmentClick?: (segmentId: string) => void
  /** 'compact' escala el overlay de subtítulo a un tamaño de fuente proporcional al contenedor — usado en players chicos (ej. ShortCard) donde el texto a tamaño fijo se ve desproporcionadamente grande. Default 'normal' preserva el tamaño fijo del editor. */
  subtitleSize?: 'normal' | 'compact'
  /** Reemplaza el aspect-video/bordes por defecto — usado para componer un fondo 9:16 cover+blur detrás de una instancia 'normal' en primer plano (ver ShortCard). */
  containerClassName?: string
  /** Reemplaza object-contain por defecto en los <video> — 'cover' para la capa de fondo desenfocada. */
  videoObjectFit?: 'contain' | 'cover'
  /** object-position horizontal en % (0 = borde izquierdo visible, 50 = centrado, 100 = borde derecho visible) — solo relevante con videoObjectFit='cover', donde recorta contenido a los costados. Default 50. */
  objectPositionX?: number
}

function findActiveSegment(playheadMs: number, segments: SubtitleSegment[] | undefined): SubtitleSegment | null {
  if (!segments) return null
  return segments.find((s) => playheadMs >= s.startMs && playheadMs < s.endMs) ?? null
}

/**
 * Componente puramente presentacional: renderiza los dos <video> del doble
 * buffer y delega toda la lógica de reproducción/sincronización a
 * usePlaybackEngine. Ver playbackEngine.ts para el cálculo de qué clip
 * corresponde a cada instante, y usePlaybackEngine.ts para cómo eso se
 * traduce en comandos sobre los elementos <video> reales.
 */
export function TimelinePlayer({
  timeline,
  assets,
  playheadMs,
  isPlaying,
  onPlayheadChange,
  onPlayingChange,
  segments,
  onActiveSegmentChange,
  onSegmentClick,
  subtitleSize = 'normal',
  containerClassName,
  videoObjectFit = 'contain',
  objectPositionX = 50,
}: TimelinePlayerProps) {
  const { videoRefA, videoRefB, activeIsA, bufferA, bufferB, hasContent, isSeeking } = usePlaybackEngine({
    timeline,
    assets,
    playheadMs,
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
    >
      {!hasContent && (
        <span className="text-sm text-text-muted">
          {isWithinTimelineRange ? '' : 'Sin contenido en esta posición'}
        </span>
      )}
      <video
        ref={videoRefA}
        src={bufferA.url || undefined}
        muted={!activeIsA}
        className={`absolute inset-0 h-full w-full ${objectFitClass}`}
        style={{ visibility: activeIsA && hasContent ? 'visible' : 'hidden', objectPosition: `${objectPositionX}% center` }}
      />
      <video
        ref={videoRefB}
        src={bufferB.url || undefined}
        muted={activeIsA}
        className={`absolute inset-0 h-full w-full ${objectFitClass}`}
        style={{ visibility: !activeIsA && hasContent ? 'visible' : 'hidden', objectPosition: `${objectPositionX}% center` }}
      />
      {hasContent && isSeeking && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}
      {hasContent && activeSegment && (
        <div
          className={`absolute inset-x-0 flex justify-center ${subtitleSize === 'compact' ? 'bottom-1 px-1' : 'bottom-4 px-4'}`}
        >
          <button
            type="button"
            onClick={() => onSegmentClick?.(activeSegment.id)}
            className={`max-w-[90%] rounded bg-black/70 text-center text-white hover:bg-black/85 ${
              subtitleSize === 'compact' ? 'line-clamp-2 px-1.5 py-0.5 text-[10px] leading-tight' : 'px-3 py-1 text-sm'
            }`}
          >
            {activeSegment.text}
          </button>
        </div>
      )}
    </div>
  )
}
