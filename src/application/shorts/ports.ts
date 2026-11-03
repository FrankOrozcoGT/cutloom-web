import type { DetectResult, ImproveResult, ScoreResult, DetectedCandidate, ProjectShorts, ShortIdeal } from '@domain/shorts'
import type { SubtitleSegment } from '@domain/subtitles'
import type { Result } from '@application/result'
import type { ShortsError } from './errors'

export interface AudioClip {
  /** Id del candidato al que pertenece este audio — el fieldname real del archivo en /score es audio_<candidateId>, no depende de la posición en el array. */
  candidateId: string
  startMs: number
  endMs: number
  audioBlob: Blob
}

export interface ShortsBackendPort {
  improveSubtitles(segments: SubtitleSegment[], userContext?: string): Promise<Result<ImproveResult, ShortsError>>
  detect(segments: SubtitleSegment[], shortIdeal?: ShortIdeal): Promise<Result<DetectResult, ShortsError>>
  score(
    candidates: DetectedCandidate[],
    audioClips: AudioClip[],
    shortIdeal?: ShortIdeal,
  ): Promise<Result<ScoreResult, ShortsError>>
}

export type ShortsStorageError = 'STORAGE_ERROR' | 'CORRUPTED_DATA'

export interface ShortsStoragePort {
  save(shorts: ProjectShorts): Promise<Result<void, ShortsStorageError>>
  getByProject(projectId: string): Promise<Result<ProjectShorts | null, ShortsStorageError>>
  deleteByProject(projectId: string): Promise<Result<void, ShortsStorageError>>
  /** Ids de todos los proyectos que tienen shorts guardados, en una sola consulta — para saber cuáles marcar en un listado sin un get por proyecto. */
  getProjectIdsWithShorts(): Promise<Result<Set<string>, ShortsStorageError>>
  /** Actualiza el ajuste de encuadre de un short sin pisar el resto del registro persistido. */
  updateCropOffset(projectId: string, shortKeyValue: string, cropOffsetX: number): Promise<Result<void, ShortsStorageError>>
}
