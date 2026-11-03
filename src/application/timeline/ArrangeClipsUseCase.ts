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
import type { TimelineStorage, TimelineStorageError } from './ports'

const STORAGE_ERROR_CODES: readonly TimelineStorageError[] = ['STORAGE_FULL', 'CORRUPTED_DATA', 'UNKNOWN_ERROR']

function isTimelineStorageError(value: string): value is TimelineStorageError {
  return (STORAGE_ERROR_CODES as string[]).includes(value)
}

/** Traduce el error de storage al subconjunto que ArrangeError expone — CORRUPTED_DATA se preserva porque el caller puede necesitar distinguirlo (ej. para ofrecer "reiniciar timeline"), el resto colapsa a STORAGE_ERROR. */
function mapStorageError(storageError: TimelineStorageError): 'CORRUPTED_DATA' | 'STORAGE_ERROR' {
  return storageError === 'CORRUPTED_DATA' ? 'CORRUPTED_DATA' : 'STORAGE_ERROR'
}

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
      return err(mapStorageError(existingResult.error))
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
   * Lee y persiste el timeline dentro de la MISMA transacción de storage
   * (ver TimelineStorage.readModifyWrite) — getTimeline()+storage.save()
   * como dos pasos independientes dejaría una ventana donde dos ediciones
   * concurrentes (ej. un split y un undo casi simultáneos) podrían leer el
   * mismo timeline base y la segunda pisaría silenciosamente los cambios de
   * la primera.
   */
  private async loadApplyAndSave(
    projectId: string,
    apply: (timeline: Timeline) => Result<Timeline, DomainError>,
  ): Promise<Result<Timeline, ArrangeError>> {
    const result = await this.storage.readModifyWrite(projectId, (existing) =>
      apply(existing ?? this.createNewTimeline(projectId)),
    )
    if (!result.ok) {
      return err(isTimelineStorageError(result.error) ? mapStorageError(result.error) : result.error)
    }
    return ok(result.value)
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
   * (p.ej. todos los silencios detectados de una vez). Deshacer con Ctrl+Z
   * revierte los N cortes juntos, no de a uno, porque llega como un único
   * cambio a useTimeline.
   */
  async removeSegments(
    projectId: string,
    cuts: { startMs: number; endMs: number }[],
  ): Promise<Result<{ timeline: Timeline; removed: RemovedSegment[] }, ArrangeError>> {
    let removed: RemovedSegment[] = []
    const result = await this.storage.readModifyWrite<never>(projectId, (existing) => {
      const applied = removeSegmentsInDomain(existing ?? this.createNewTimeline(projectId), cuts)
      removed = applied.removed
      return ok(applied.timeline)
    })
    if (!result.ok) {
      return err(isTimelineStorageError(result.error) ? mapStorageError(result.error) : result.error)
    }
    return ok({ timeline: result.value, removed })
  }

  /**
   * Revierte el corte de removeSegment: reabre el hueco y reinserta el clip
   * quitado en `atMs` — la posición ACTUAL del hueco, que el caller rastrea
   * porque puede haberse desplazado por otros cortes/reinserciones desde que
   * se quitó este segmento.
   */
  async reinsertSegment(projectId: string, removed: RemovedSegment, atMs: number): Promise<Result<Timeline, ArrangeError>> {
    return this.loadApplyAndSave(projectId, (timeline) => ok(reinsertSegmentInDomain(timeline, removed, atMs)))
  }

  async deleteClip(projectId: string, clipId: string): Promise<Result<Timeline, ArrangeError>> {
    return this.loadApplyAndSave(projectId, (timeline) => deleteClipInDomain(timeline, clipId))
  }

  /** Quita del timeline los clips que referencian assetId, para cuando su VideoAsset se borra. */
  async removeClipsByAsset(projectId: string, assetId: string): Promise<Result<Timeline, ArrangeError>> {
    return this.loadApplyAndSave(projectId, (timeline) => ok(removeClipsByAsset(timeline, assetId)))
  }

  /** Vacía todos los clips del timeline, manteniendo la estructura de pistas. */
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
