import {
  addClipToTrack,
  clearAllClips,
  createClip,
  createTimeline,
  createTrack,
  deleteClip as deleteClipInDomain,
  findValidTrack,
  moveClip as moveClipInDomain,
  reinsertSegment as reinsertSegmentInDomain,
  removeClipsByAsset,
  removeSegments as removeSegmentsInDomain,
  resizeClip as resizeClipInDomain,
  splitClip as splitClipInDomain,
  type RemovedSegment,
  type Timeline,
  type TrimEdge,
} from '@domain/timeline'
import { err, ok, type Result } from '@application/result'
import type { TimelineStorage } from './ports'

type DomainError = 'OVERLAP' | 'TRACK_FULL' | 'INVALID_DURATION' | 'INVALID_OFFSET' | 'CLIP_NOT_FOUND' | 'TRACK_NOT_FOUND' | 'TRIM_EXCEEDS_SOURCE' | 'CUT_OUT_OF_BOUNDS' | 'CUT_ZERO_LENGTH'

export type ArrangeError =
  | 'OVERLAP'
  | 'TRACK_FULL'
  | 'INVALID_DURATION'
  | 'INVALID_OFFSET'
  | 'CLIP_NOT_FOUND'
  | 'TRACK_NOT_FOUND'
  | 'TRIM_EXCEEDS_SOURCE'
  | 'CUT_OUT_OF_BOUNDS'
  | 'CUT_ZERO_LENGTH'
  | 'CORRUPTED_DATA'
  | 'STORAGE_ERROR'

export class ArrangeClipsUseCase {
  private readonly storage: TimelineStorage

  constructor(storage: TimelineStorage) {
    this.storage = storage
  }

  async getTimeline(projectId: string): Promise<Result<Timeline, ArrangeError>> {
    const existingResult = await this.storage.getByProject(projectId)
    if (!existingResult.ok) {
      return err(existingResult.error === 'CORRUPTED_DATA' ? 'CORRUPTED_DATA' : 'STORAGE_ERROR')
    }
    return ok(existingResult.value ?? this.createNewTimeline(projectId))
  }

  createNewTimeline(projectId: string): Timeline {
    return createTimeline(projectId)
  }

  async addClip(
    projectId: string,
    assetId: string,
    durationMs: number,
    trackId?: string,
    offsetMs?: number,
  ): Promise<Result<Timeline, ArrangeError>> {
    const timelineResult = await this.getTimeline(projectId)
    if (!timelineResult.ok) {
      return err(timelineResult.error)
    }
    const timeline = timelineResult.value

    const resolvedOffset = offsetMs ?? this.appendOffset(timeline, trackId)
    const clipResult = createClip(assetId, durationMs, resolvedOffset)
    if (!clipResult.ok) {
      return err(clipResult.error)
    }

    let workingTimeline = timeline
    let targetTrack = trackId
      ? workingTimeline.tracks.find((track) => track.id === trackId)
      : findValidTrack(workingTimeline, clipResult.value)

    if (!targetTrack) {
      if (trackId) {
        return err('TRACK_NOT_FOUND')
      }
      // Ninguna pista existente tiene hueco: se crea una nueva en vez de fallar,
      // igual que en un editor real donde agregar un clip siempre encuentra lugar.
      const newTrack = createTrack()
      workingTimeline = { ...workingTimeline, tracks: [...workingTimeline.tracks, newTrack] }
      targetTrack = newTrack
    }

    const addResult = addClipToTrack(workingTimeline, clipResult.value, targetTrack.id)
    if (!addResult.ok) {
      return err(addResult.error)
    }

    const saveResult = await this.storage.save(addResult.value)
    if (!saveResult.ok) {
      return err('STORAGE_ERROR')
    }

    return ok(addResult.value)
  }

  /**
   * Carga el timeline vigente, le aplica una operación de dominio que puede
   * fallar (Result), y persiste el resultado — el patrón que comparten
   * moveClip/resizeClip/splitClip/deleteClip: solo cambia qué función de
   * dominio se aplica y con qué argumentos, nunca el resto del flujo.
   */
  private async loadApplyAndSave(
    projectId: string,
    apply: (timeline: Timeline) => Result<Timeline, DomainError>,
  ): Promise<Result<Timeline, ArrangeError>> {
    const timelineResult = await this.getTimeline(projectId)
    if (!timelineResult.ok) {
      return err(timelineResult.error)
    }

    const applyResult = apply(timelineResult.value)
    if (!applyResult.ok) {
      return err(applyResult.error)
    }

    const saveResult = await this.storage.save(applyResult.value)
    if (!saveResult.ok) {
      return err('STORAGE_ERROR')
    }

    return ok(applyResult.value)
  }

  async moveClip(
    projectId: string,
    clipId: string,
    newTrackId?: string,
    newOffsetMs?: number,
  ): Promise<Result<Timeline, ArrangeError>> {
    return this.loadApplyAndSave(projectId, (timeline) => {
      const currentTrack = timeline.tracks.find((track) => track.clips.some((clip) => clip.id === clipId))
      if (!currentTrack) {
        return err('CLIP_NOT_FOUND')
      }
      const currentClip = currentTrack.clips.find((clip) => clip.id === clipId)!
      const resolvedTrackId = newTrackId ?? currentTrack.id
      const resolvedOffset = newOffsetMs ?? currentClip.offsetMs
      return moveClipInDomain(timeline, clipId, resolvedTrackId, resolvedOffset)
    })
  }

  async resizeClip(
    projectId: string,
    clipId: string,
    edge: TrimEdge,
    newBoundaryMs: number,
    sourceDurationMs: number,
  ): Promise<Result<Timeline, ArrangeError>> {
    return this.loadApplyAndSave(projectId, (timeline) =>
      resizeClipInDomain(timeline, clipId, edge, newBoundaryMs, sourceDurationMs),
    )
  }

  async splitClip(
    projectId: string,
    clipId: string,
    cutPointMs: number,
  ): Promise<Result<Timeline, ArrangeError>> {
    return this.loadApplyAndSave(projectId, (timeline) => splitClipInDomain(timeline, clipId, cutPointMs))
  }

  /**
   * Quita varios tramos [startMs, endMs) del timeline en una sola operación
   * (p.ej. todos los silencios detectados de una vez) — removeSegments del
   * dominio ya resuelve el lote completo sobre el timeline en memoria; acá
   * solo se persiste el resultado final, igual que cualquier otra acción de
   * este caso de uso. Deshacer con Ctrl+Z revierte los N cortes juntos, no de
   * a uno, porque llega como un único cambio a useTimeline.
   */
  async removeSegments(
    projectId: string,
    cuts: { startMs: number; endMs: number }[],
  ): Promise<Result<{ timeline: Timeline; removed: RemovedSegment[] }, ArrangeError>> {
    const timelineResult = await this.getTimeline(projectId)
    if (!timelineResult.ok) {
      return err(timelineResult.error)
    }

    const result = removeSegmentsInDomain(timelineResult.value, cuts)

    const saveResult = await this.storage.save(result.timeline)
    if (!saveResult.ok) {
      return err('STORAGE_ERROR')
    }

    return ok(result)
  }

  /**
   * Revierte el corte de removeSegment: reabre el hueco y reinserta el clip
   * quitado en `atMs` — la posición ACTUAL del hueco, que el caller rastrea
   * porque puede haberse desplazado por otros cortes/reinserciones desde que
   * se quitó este segmento. reinsertSegmentInDomain nunca falla (no tiene
   * precondiciones que puedan violarse) — se envuelve en ok() solo para
   * encajar en el mismo loadApplyAndSave que el resto de operaciones.
   */
  async reinsertSegment(projectId: string, removed: RemovedSegment, atMs: number): Promise<Result<Timeline, ArrangeError>> {
    return this.loadApplyAndSave(projectId, (timeline) => ok(reinsertSegmentInDomain(timeline, removed, atMs)))
  }

  async deleteClip(projectId: string, clipId: string): Promise<Result<Timeline, ArrangeError>> {
    return this.loadApplyAndSave(projectId, (timeline) => deleteClipInDomain(timeline, clipId))
  }

  /** Quita del timeline los clips que referencian assetId, para cuando su VideoAsset se borra. removeClipsByAsset nunca falla — se envuelve en ok() por el mismo motivo que reinsertSegment. */
  async removeClipsByAsset(projectId: string, assetId: string): Promise<Result<Timeline, ArrangeError>> {
    return this.loadApplyAndSave(projectId, (timeline) => ok(removeClipsByAsset(timeline, assetId)))
  }

  /** Vacía todos los clips del timeline, manteniendo la estructura de pistas. clearAllClips nunca falla — se envuelve en ok() por el mismo motivo que reinsertSegment. */
  async clearAllClips(projectId: string): Promise<Result<Timeline, ArrangeError>> {
    return this.loadApplyAndSave(projectId, (timeline) => ok(clearAllClips(timeline)))
  }

  async saveTimeline(timeline: Timeline): Promise<Result<Timeline, ArrangeError>> {
    const saveResult = await this.storage.save(timeline)
    if (!saveResult.ok) {
      return err('STORAGE_ERROR')
    }
    return ok(timeline)
  }

  private appendOffset(timeline: Timeline, trackId?: string): number {
    const track = trackId ? timeline.tracks.find((t) => t.id === trackId) : undefined
    const clips = track ? track.clips : timeline.tracks.flatMap((t) => t.clips)
    if (clips.length === 0) {
      return 0
    }
    return Math.max(...clips.map((clip) => clip.offsetMs + clip.durationMs))
  }
}
