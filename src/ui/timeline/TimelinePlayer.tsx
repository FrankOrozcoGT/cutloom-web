import { getTimelineDurationMs, type Timeline } from '@domain/timeline'
import type { VideoAsset } from '@domain/video'
import { usePlaybackEngine } from './usePlaybackEngine'

interface TimelinePlayerProps {
  timeline: Timeline
  assets: Record<string, VideoAsset>
  playheadMs: number
  isPlaying: boolean
  onPlayheadChange: (ms: number) => void
  onPlayingChange: (isPlaying: boolean) => void
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
}: TimelinePlayerProps) {
  const { videoRefA, videoRefB, activeIsA, bufferA, bufferB, hasContent } = usePlaybackEngine({
    timeline,
    assets,
    playheadMs,
    isPlaying,
    onPlayheadChange,
    onPlayingChange,
  })

  const durationMs = getTimelineDurationMs(timeline)
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
    </div>
  )
}
