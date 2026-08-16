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

  return (
    <div className="relative flex aspect-video max-h-full w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-bg">
      {!hasContent && (
        <span className="text-sm text-text-muted">
          {isWithinTimelineRange ? '' : 'Sin contenido en esta posición'}
        </span>
      )}
      <video
        ref={videoRefA}
        src={bufferA.url || undefined}
        muted={!activeIsA}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ visibility: activeIsA && hasContent ? 'visible' : 'hidden' }}
      />
      <video
        ref={videoRefB}
        src={bufferB.url || undefined}
        muted={activeIsA}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ visibility: !activeIsA && hasContent ? 'visible' : 'hidden' }}
      />
      {hasContent && isSeeking && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}
      {hasContent && activeSegment && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
          <button
            type="button"
            onClick={() => onSegmentClick?.(activeSegment.id)}
            className="max-w-[90%] rounded bg-black/70 px-3 py-1 text-center text-sm text-white hover:bg-black/85"
          >
            {activeSegment.text}
          </button>
        </div>
      )}
    </div>
  )
}
