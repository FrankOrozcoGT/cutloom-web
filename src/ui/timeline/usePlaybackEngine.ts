import { useRef, useState } from 'react'
import { findActiveClip, type Timeline } from '@domain/timeline'
import type { ProxyAsset } from '@domain/video'
import { useTimelineRenderer } from './useTimelineRenderer'

interface UsePlaybackEngineArgs {
  timeline: Timeline
  /** Proxies livianos del proyecto, indexados por videoAssetId (= Clip.assetId) — la reproducción en vivo siempre trabaja sobre estos, nunca sobre los VideoAsset originales. */
  proxies: Record<string, ProxyAsset>
  playheadMs: number
  /** Incrementado SOLO ante un seek explícito del usuario — nunca por el propio motor reportando su avance normal vía onPlayheadChange. */
  seekVersion: number
  isPlaying: boolean
  onPlayheadChange: (ms: number) => void
  onPlayingChange: (isPlaying: boolean) => void
}

/**
 * Motor de reproducción del timeline compuesto — delega todo el trabajo a
 * useTimelineRenderer, que usa AudioContext como reloj maestro mientras
 * reproduce y decodifica bajo demanda (WebCodecs vía mediabunny) el frame y
 * el audio del clip activo sobre los PROXIES, nunca sobre los VideoAsset
 * originales, pintando en un único <canvas>.
 */
export function usePlaybackEngine({
  timeline,
  proxies,
  playheadMs,
  seekVersion,
  isPlaying,
  onPlayheadChange,
  onPlayingChange,
}: UsePlaybackEngineArgs) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isLoading, setIsLoading] = useState(false)

  useTimelineRenderer({
    timeline,
    proxies,
    playheadMs,
    seekVersion,
    isPlaying,
    onPlayheadChange,
    onEnded: () => onPlayingChange(false),
    onLoadingChange: setIsLoading,
    canvasRef,
  })

  return {
    canvasRef,
    hasContent: findActiveClip(timeline, playheadMs) !== null,
    isLoading,
  }
}
