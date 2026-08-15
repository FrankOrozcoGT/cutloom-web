import { useCallback, useEffect, useState } from 'react'
import type { Timeline, TrimEdge } from '@domain/timeline'
import type { ArrangeError } from '@application/timeline/ArrangeClipsUseCase'
import { arrangeUseCase } from './composition'

const DEFAULT_PX_PER_SEC = 60
const MAX_HISTORY = 50

export function useTimeline(projectId: string) {
  const [timeline, setTimelineState] = useState<Timeline | null>(null)
  const [past, setPast] = useState<Timeline[]>([])
  const [future, setFuture] = useState<Timeline[]>([])
  const [error, setError] = useState<ArrangeError | null>(null)
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC)
  const [playheadMs, setPlayheadMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await arrangeUseCase.getTimeline(projectId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setTimelineState(result.value)
    setPast([])
    setFuture([])
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const pxToMs = useCallback((px: number) => Math.max(0, Math.round((px / pxPerSec) * 1000)), [pxPerSec])
  const msToPx = useCallback((ms: number) => (ms / 1000) * pxPerSec, [pxPerSec])

  // Registra el timeline previo en el historial antes de aplicar el nuevo,
  // para que undo/redo funcionen sobre cualquier operación (add/move/resize/split).
  const applyNewTimeline = useCallback((nextTimeline: Timeline) => {
    setTimelineState((current) => {
      if (current) {
        setPast((prev) => [...prev.slice(-(MAX_HISTORY - 1)), current])
      }
      setFuture([])
      return nextTimeline
    })
  }, [])

  const addClip = useCallback(
    async (assetId: string, durationMs: number, trackId?: string, offsetPx?: number) => {
      const offsetMs = offsetPx !== undefined ? pxToMs(offsetPx) : undefined
      const result = await arrangeUseCase.addClip(projectId, assetId, durationMs, trackId, offsetMs)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      applyNewTimeline(result.value)
    },
    [projectId, pxToMs, applyNewTimeline],
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
      applyNewTimeline(result.value)
    },
    [projectId, pxToMs, applyNewTimeline],
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
      applyNewTimeline(result.value)
    },
    [projectId, pxToMs, applyNewTimeline],
  )

  const splitClip = useCallback(
    async (clipId: string, cutPointMs: number) => {
      const result = await arrangeUseCase.splitClip(projectId, clipId, cutPointMs)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      applyNewTimeline(result.value)
    },
    [projectId, applyNewTimeline],
  )

  const undo = useCallback(async () => {
    setPast((prevPast) => {
      if (prevPast.length === 0 || !timeline) return prevPast
      const previous = prevPast[prevPast.length - 1]
      setFuture((prevFuture) => [...prevFuture, timeline].slice(-MAX_HISTORY))
      setTimelineState(previous)
      void arrangeUseCase.saveTimeline(previous)
      return prevPast.slice(0, -1)
    })
  }, [timeline])

  const redo = useCallback(async () => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0 || !timeline) return prevFuture
      const next = prevFuture[prevFuture.length - 1]
      setPast((prevPast) => [...prevPast, timeline].slice(-MAX_HISTORY))
      setTimelineState(next)
      void arrangeUseCase.saveTimeline(next)
      return prevFuture.slice(0, -1)
    })
  }, [timeline])

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
    splitClip,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    playheadMs,
    setPlayheadMs,
    isPlaying,
    setIsPlaying,
    selectedClipId,
    setSelectedClipId,
    load,
  }
}
