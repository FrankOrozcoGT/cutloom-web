import { useCallback, useEffect, useState } from 'react'
import type { RemovedSegment, Timeline, TrimEdge } from '@domain/timeline'
import type { Subtitles } from '@domain/subtitles'
import type { ArrangeError } from '@application/timeline/ArrangeClipsUseCase'
import { arrangeUseCase } from './composition'
import type { RemovedSegmentChip } from './Timeline'

const DEFAULT_PX_PER_SEC = 60
const MAX_HISTORY = 50

interface HistoryEntry {
  timeline: Timeline
  /** Subtítulos vigentes al momento de este snapshot, para restaurarlos coherentes con el timeline en undo/redo. */
  subtitles: Subtitles | null
  /** Chips de silencios quitados vigentes en este snapshot — sus offsets solo corresponden a ESTE timeline, así que viajan con él en el historial: undo/redo los restauran juntos. */
  removedChips: RemovedSegmentChip[]
}

interface SubtitlesBridge {
  get: () => Subtitles | null
  /** Se llama al deshacer/rehacer, para que useSubtitles refleje el snapshot restaurado (incluye limpiar con null). */
  restore: (subtitles: Subtitles | null) => void
}

interface RemovedChipsBridge {
  get: () => RemovedSegmentChip[]
  /** Se llama al deshacer/rehacer/vaciar, para que los chips reflejen el snapshot restaurado. */
  restore: (chips: RemovedSegmentChip[]) => void
}

/**
 * projectId puede cambiar de identidad en cada render si el caller lo arma
 * inline (p.ej. `projectId ?? ''`); solo se compara por valor acá adentro,
 * así que un valor primitivo estable alcanza — no hace falta memoizarlo afuera.
 */
export function useTimeline(
  projectId: string,
  subtitlesBridge?: SubtitlesBridge,
  removedChipsBridge?: RemovedChipsBridge,
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
    (nextTimeline: Timeline, nextRemovedChips?: RemovedSegmentChip[]) => {
      const previousSubtitles = subtitlesBridge?.get() ?? null
      const previousChips = removedChipsBridge?.get() ?? []

      if (timeline) {
        const entry: HistoryEntry = { timeline, subtitles: previousSubtitles, removedChips: previousChips }
        setPast((prev) => [...prev.slice(-(MAX_HISTORY - 1)), entry])
      }
      setFuture([])
      setTimelineState(nextTimeline)

      if (previousSubtitles) {
        subtitlesBridge?.restore(null)
      }
      // Si este cambio también trae chips de silencio nuevos (p.ej. detectar
      // silencios), se restauran acá mismo — en el mismo paso que el timeline
      // — para que timeline y chips queden como un solo escalón de historial,
      // no dos independientes que undo/redo tendrían que deshacer por separado.
      if (nextRemovedChips) {
        removedChipsBridge?.restore(nextRemovedChips)
      }
    },
    [timeline, subtitlesBridge, removedChipsBridge],
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
    async (
      cuts: { startMs: number; endMs: number }[],
      computeNextRemovedChips?: (removed: RemovedSegment[]) => RemovedSegmentChip[],
    ): Promise<RemovedSegment[]> => {
      if (cuts.length === 0) return []
      const result = await arrangeUseCase.removeSegments(projectId, cuts)
      if (!result.ok) {
        setError(result.error)
        return []
      }
      setError(null)
      const nextRemovedChips = computeNextRemovedChips?.(result.value.removed)
      applyNewTimeline(result.value.timeline, nextRemovedChips)
      return result.value.removed
    },
    [projectId, applyNewTimeline],
  )

  const reinsertSegment = useCallback(
    async (removed: RemovedSegment, atMs: number, nextRemovedChips?: RemovedSegmentChip[]) => {
      const result = await arrangeUseCase.reinsertSegment(projectId, removed, atMs)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      applyNewTimeline(result.value, nextRemovedChips)
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
    // Vaciar deja el timeline sin silencios quitados que mostrar — los chips
    // previos quedan en la misma entrada de historial que empuja
    // applyNewTimeline, así que un undo los recupera.
    applyNewTimeline(result.value, [])
  }, [projectId, applyNewTimeline])

  // undo y redo son el mismo viaje en el historial, solo con past/future
  // intercambiados — travel() concentra ese único flujo, parametrizado por
  // de qué pila se saca la entrada (source) y a cuál se empuja el estado
  // actual (destination), para que un fix futuro (ej. al manejo de bridges)
  // no dependa de tocar dos copias espejadas y quedar desalineado entre sí.
  //
  // Lee `past`/`future`/`timeline` directamente del closure en vez de usar el
  // patrón funcional setPast(prev => ...): ese patrón invitaba a meter
  // side-effects (restore de bridges, saveTimeline) DENTRO del updater, y
  // React (sobre todo StrictMode) puede invocar un updater más de una vez
  // para detectar impurezas — cada invocación extra repetía esos
  // side-effects, vaciando los chips que la primera pasada ya había
  // restaurado. Todo el trabajo real corre una sola vez, fuera de cualquier
  // updater; los updaters solo hacen el cálculo puro del array.
  const travel = useCallback(
    (
      source: HistoryEntry[],
      setSource: (updater: (prev: HistoryEntry[]) => HistoryEntry[]) => void,
      setDestination: (updater: (prev: HistoryEntry[]) => HistoryEntry[]) => void,
    ) => {
      if (source.length === 0 || !timeline) return
      const target = source[source.length - 1]
      const currentChips = removedChipsBridge?.get() ?? []
      setDestination((prev) =>
        [...prev, { timeline, subtitles: subtitlesBridge?.get() ?? null, removedChips: currentChips }].slice(
          -MAX_HISTORY,
        ),
      )
      setSource((prev) => prev.slice(0, -1))
      setTimelineState(target.timeline)
      subtitlesBridge?.restore(target.subtitles)
      removedChipsBridge?.restore(target.removedChips)
      // El timeline en memoria ya avanzó al punto del historial — si el
      // guardado falla, se avisa pero no se revierte el estado en pantalla
      // (undo/redo debe seguir siendo instantáneo); el usuario sabe que ese
      // punto todavía no quedó persistido.
      void arrangeUseCase.saveTimeline(target.timeline).then((result) => {
        if (!result.ok) {
          setError(result.error)
        }
      })
    },
    [timeline, subtitlesBridge, removedChipsBridge],
  )

  const undo = useCallback(() => travel(past, setPast, setFuture), [travel, past])
  const redo = useCallback(() => travel(future, setFuture, setPast), [travel, future])

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
