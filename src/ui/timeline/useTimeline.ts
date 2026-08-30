import { useCallback, useEffect, useState } from 'react'
import type { RemovedSegment, Timeline, TrimEdge } from '@domain/timeline'
import type { Subtitles } from '@domain/subtitles'
import type { ArrangeError } from '@application/timeline/ArrangeClipsUseCase'
import { arrangeUseCase } from './composition'

const DEFAULT_PX_PER_SEC = 60
const MAX_HISTORY = 50

interface HistoryEntry {
  timeline: Timeline
  /** Subtítulos vigentes al momento de este snapshot, para restaurarlos coherentes con el timeline en undo/redo. */
  subtitles: Subtitles | null
}

interface SubtitlesBridge {
  get: () => Subtitles | null
  /** Se llama al deshacer/rehacer, para que useSubtitles refleje el snapshot restaurado (incluye limpiar con null). */
  restore: (subtitles: Subtitles | null) => void
}

/**
 * projectId puede cambiar de identidad en cada render si el caller lo arma
 * inline (p.ej. `projectId ?? ''`); solo se compara por valor acá adentro,
 * así que un valor primitivo estable alcanza — no hace falta memoizarlo afuera.
 */
export function useTimeline(projectId: string, subtitlesBridge?: SubtitlesBridge) {
  const [timeline, setTimelineState] = useState<Timeline | null>(null)
  const [past, setPast] = useState<HistoryEntry[]>([])
  const [future, setFuture] = useState<HistoryEntry[]>([])
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

  // Registra timeline+subtítulos previos en el historial antes de aplicar el
  // nuevo timeline, para que undo/redo restauren ambos coherentes entre sí.
  // Cualquier cambio estructural del timeline invalida los subtítulos vigentes
  // (sus timestamps ya no corresponden al material editado) — se limpian acá,
  // no queda a cargo de cada acción individual (add/move/resize/split/delete).
  const applyNewTimeline = useCallback(
    (nextTimeline: Timeline) => {
      const previousSubtitles = subtitlesBridge?.get() ?? null

      setTimelineState((current) => {
        if (current) {
          const entry: HistoryEntry = { timeline: current, subtitles: previousSubtitles }
          setPast((prev) => [...prev.slice(-(MAX_HISTORY - 1)), entry])
        }
        setFuture([])
        return nextTimeline
      })

      if (previousSubtitles) {
        subtitlesBridge?.restore(null)
      }
    },
    [subtitlesBridge],
  )

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

  const removeSegments = useCallback(
    async (cuts: { startMs: number; endMs: number }[]): Promise<RemovedSegment[]> => {
      if (cuts.length === 0) return []
      const result = await arrangeUseCase.removeSegments(projectId, cuts)
      if (!result.ok) {
        setError(result.error)
        return []
      }
      setError(null)
      applyNewTimeline(result.value.timeline)
      return result.value.removed
    },
    [projectId, applyNewTimeline],
  )

  const reinsertSegment = useCallback(
    async (removed: RemovedSegment) => {
      const result = await arrangeUseCase.reinsertSegment(projectId, removed)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      applyNewTimeline(result.value)
    },
    [projectId, applyNewTimeline],
  )

  const deleteClip = useCallback(
    async (clipId: string) => {
      const result = await arrangeUseCase.deleteClip(projectId, clipId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setSelectedClipId((current) => (current === clipId ? null : current))
      applyNewTimeline(result.value)
    },
    [projectId, applyNewTimeline],
  )

  const removeClipsByAsset = useCallback(
    async (assetId: string) => {
      const result = await arrangeUseCase.removeClipsByAsset(projectId, assetId)
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
      setFuture((prevFuture) =>
        [...prevFuture, { timeline, subtitles: subtitlesBridge?.get() ?? null }].slice(-MAX_HISTORY),
      )
      setTimelineState(previous.timeline)
      subtitlesBridge?.restore(previous.subtitles)
      void arrangeUseCase.saveTimeline(previous.timeline)
      return prevPast.slice(0, -1)
    })
  }, [timeline, subtitlesBridge])

  const redo = useCallback(async () => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0 || !timeline) return prevFuture
      const next = prevFuture[prevFuture.length - 1]
      setPast((prevPast) =>
        [...prevPast, { timeline, subtitles: subtitlesBridge?.get() ?? null }].slice(-MAX_HISTORY),
      )
      setTimelineState(next.timeline)
      subtitlesBridge?.restore(next.subtitles)
      void arrangeUseCase.saveTimeline(next.timeline)
      return prevFuture.slice(0, -1)
    })
  }, [timeline, subtitlesBridge])

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
    removeSegments,
    reinsertSegment,
    deleteClip,
    removeClipsByAsset,
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
