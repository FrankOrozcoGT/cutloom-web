import { useCallback, useEffect, useState } from 'react'
import type { RemovedSegment, Timeline, TrimEdge } from '@domain/timeline'
import type { Subtitles } from '@domain/subtitles'
import type { ArrangeError } from '@application/timeline/ArrangeClipsUseCase'
import { arrangeUseCase } from './composition'
import type { RemovedSilenceChip } from './Timeline'

const DEFAULT_PX_PER_SEC = 60
const MAX_HISTORY = 50

interface HistoryEntry {
  timeline: Timeline
  /** Subtítulos vigentes al momento de este snapshot, para restaurarlos coherentes con el timeline en undo/redo. */
  subtitles: Subtitles | null
  /** Chips de silencios quitados vigentes en este snapshot — sus offsets solo corresponden a ESTE timeline, así que viajan con él en el historial: undo/redo los restauran juntos. */
  removedSilences: RemovedSilenceChip[]
}

interface SubtitlesBridge {
  get: () => Subtitles | null
  /** Se llama al deshacer/rehacer, para que useSubtitles refleje el snapshot restaurado (incluye limpiar con null). */
  restore: (subtitles: Subtitles | null) => void
}

interface RemovedSilencesBridge {
  get: () => RemovedSilenceChip[]
  /** Se llama al deshacer/rehacer/vaciar, para que los chips reflejen el snapshot restaurado. */
  restore: (chips: RemovedSilenceChip[]) => void
}

/**
 * projectId puede cambiar de identidad en cada render si el caller lo arma
 * inline (p.ej. `projectId ?? ''`); solo se compara por valor acá adentro,
 * así que un valor primitivo estable alcanza — no hace falta memoizarlo afuera.
 */
export function useTimeline(
  projectId: string,
  subtitlesBridge?: SubtitlesBridge,
  removedSilencesBridge?: RemovedSilencesBridge,
) {
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
    // Los chips de silencios NO se tocan: se persisten por proyecto y sus
    // offsets siguen correspondiendo al timeline guardado.
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const pxToMs = useCallback((px: number) => Math.max(0, Math.round((px / pxPerSec) * 1000)), [pxPerSec])
  const msToPx = useCallback((ms: number) => (ms / 1000) * pxPerSec, [pxPerSec])

  // Pausa la reproducción ante cualquier cambio de timeline (edición nueva,
  // undo, redo, o cargar/cambiar de proyecto) — el reloj de pared de
  // usePlaybackEngine no sabe recalcular en caliente qué corresponde ahora si
  // la estructura cambió bajo el playhead (un corte puede acortar el
  // timeline, mover offsets, hacer que el punto donde ibas ya no exista o
  // corresponda a otro clip). En vez de sincronizar eso de forma segura, se
  // pausa y el playhead queda como marcador de "dónde ibas" — el usuario
  // retoma play manualmente si quiere. Pausar en el primer timeline cargado
  // es un no-op (isPlaying ya arranca en false).
  useEffect(() => {
    setIsPlaying(false)
  }, [timeline])

  // Registra timeline+subtítulos+chips previos en el historial antes de
  // aplicar el nuevo timeline, para que undo/redo restauren los tres
  // coherentes entre sí. Cualquier cambio estructural del timeline invalida
  // los subtítulos vigentes (sus timestamps ya no corresponden al material
  // editado) — se limpian acá, no queda a cargo de cada acción individual.
  const applyNewTimeline = useCallback(
    (nextTimeline: Timeline) => {
      const previousSubtitles = subtitlesBridge?.get() ?? null
      const previousSilences = removedSilencesBridge?.get() ?? []

      setTimelineState((current) => {
        if (current) {
          const entry: HistoryEntry = { timeline: current, subtitles: previousSubtitles, removedSilences: previousSilences }
          setPast((prev) => [...prev.slice(-(MAX_HISTORY - 1)), entry])
        }
        setFuture([])
        return nextTimeline
      })

      if (previousSubtitles) {
        subtitlesBridge?.restore(null)
      }
    },
    [subtitlesBridge, removedSilencesBridge],
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

  const clearAllClips = useCallback(async () => {
    const result = await arrangeUseCase.clearAllClips(projectId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setSelectedClipId(null)
    applyNewTimeline(result.value)
    // Vaciar deja el timeline sin silencios quitados que mostrar — los chips
    // previos ya quedaron en la entrada de historial que pusheó
    // applyNewTimeline, así que un undo los recupera.
    removedSilencesBridge?.restore([])
  }, [projectId, applyNewTimeline, removedSilencesBridge])

  const undo = useCallback(async () => {
    setPast((prevPast) => {
      if (prevPast.length === 0 || !timeline) return prevPast
      const previous = prevPast[prevPast.length - 1]
      setFuture((prevFuture) =>
        [
          ...prevFuture,
          {
            timeline,
            subtitles: subtitlesBridge?.get() ?? null,
            removedSilences: removedSilencesBridge?.get() ?? [],
          },
        ].slice(-MAX_HISTORY),
      )
      setTimelineState(previous.timeline)
      subtitlesBridge?.restore(previous.subtitles)
      removedSilencesBridge?.restore(previous.removedSilences)
      void arrangeUseCase.saveTimeline(previous.timeline)
      return prevPast.slice(0, -1)
    })
  }, [timeline, subtitlesBridge, removedSilencesBridge])

  const redo = useCallback(async () => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0 || !timeline) return prevFuture
      const next = prevFuture[prevFuture.length - 1]
      setPast((prevPast) =>
        [
          ...prevPast,
          {
            timeline,
            subtitles: subtitlesBridge?.get() ?? null,
            removedSilences: removedSilencesBridge?.get() ?? [],
          },
        ].slice(-MAX_HISTORY),
      )
      setTimelineState(next.timeline)
      subtitlesBridge?.restore(next.subtitles)
      removedSilencesBridge?.restore(next.removedSilences)
      void arrangeUseCase.saveTimeline(next.timeline)
      return prevFuture.slice(0, -1)
    })
  }, [timeline, subtitlesBridge, removedSilencesBridge])

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
    clearAllClips,
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
