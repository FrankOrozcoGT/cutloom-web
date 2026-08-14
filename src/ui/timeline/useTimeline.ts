import { useCallback, useEffect, useState } from 'react'
import type { Timeline, TrimEdge } from '@domain/timeline'
import type { ArrangeError } from '@application/timeline/ArrangeClipsUseCase'
import { arrangeUseCase } from './composition'

const DEFAULT_PX_PER_SEC = 60

export function useTimeline(projectId: string) {
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [error, setError] = useState<ArrangeError | null>(null)
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC)
  const [playheadMs, setPlayheadMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const load = useCallback(async () => {
    const result = await arrangeUseCase.getTimeline(projectId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setTimeline(result.value)
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const pxToMs = useCallback((px: number) => Math.max(0, Math.round((px / pxPerSec) * 1000)), [pxPerSec])
  const msToPx = useCallback((ms: number) => (ms / 1000) * pxPerSec, [pxPerSec])

  const addClip = useCallback(
    async (assetId: string, durationMs: number, trackId?: string, offsetPx?: number) => {
      const offsetMs = offsetPx !== undefined ? pxToMs(offsetPx) : undefined
      const result = await arrangeUseCase.addClip(projectId, assetId, durationMs, trackId, offsetMs)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setTimeline(result.value)
    },
    [projectId, pxToMs],
  )

  const moveClip = useCallback(
    async (clipId: string, trackId?: string, offsetPx?: number) => {
      const offsetMs = offsetPx !== undefined ? pxToMs(offsetPx) : undefined
      const result = await arrangeUseCase.moveClip(projectId, clipId, trackId, offsetMs)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setTimeline(result.value)
    },
    [projectId, pxToMs],
  )

  const resizeClip = useCallback(
    async (clipId: string, edge: TrimEdge, newBoundaryPx: number, sourceDurationMs: number) => {
      const newBoundaryMs = pxToMs(newBoundaryPx)
      const result = await arrangeUseCase.resizeClip(projectId, clipId, edge, newBoundaryMs, sourceDurationMs)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setTimeline(result.value)
    },
    [projectId, pxToMs],
  )

  return {
    timeline,
    error,
    pxPerSec,
    setPxPerSec,
    pxToMs,
    msToPx,
    addClip,
    moveClip,
    resizeClip,
    playheadMs,
    setPlayheadMs,
    isPlaying,
    setIsPlaying,
    load,
  }
}
