import type {
  AutoFrameKeyframe,
  DetectResult,
  ImproveResult,
  NormalizedRect,
  ScoreResult,
  DetectedCandidate,
  ProjectShorts,
  ShortIdeal,
} from '@domain/shorts'
import type { Render } from '@domain/render'
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
  /** Activa o desactiva el auto-encuadre de un short sin pisar el resto del registro persistido. */
  updateAutoFrameEnabled(projectId: string, shortKeyValue: string, enabled: boolean): Promise<Result<void, ShortsStorageError>>
  /** Guarda la trayectoria de auto-encuadre ya calculada (ver MotionFramingAnalyzerPort) de un short sin pisar el resto del registro persistido. */
  updateAutoFraming(
    projectId: string,
    shortKeyValue: string,
    keyframes: AutoFrameKeyframe[],
  ): Promise<Result<void, ShortsStorageError>>
  /**
   * Contrato: toda implementación DEBE descartar, en la misma escritura,
   * cualquier trayectoria de auto-encuadre ya calculada (autoFramingByShort)
   * — quedaron calculadas contra la región vieja, ya no son válidas contra
   * la nueva. No toca autoFrameEnabledByShort: el short sigue "queriendo"
   * auto-encuadre, solo le falta volver a calcularlo. El nombre del método
   * refleja esto para que ningún caller necesite leer este comentario para
   * confiar en la invalidación.
   */
  updateMotionExcludeRectAndClearAutoFraming(
    projectId: string,
    rect: NormalizedRect | null,
  ): Promise<Result<void, ShortsStorageError>>
}

export type ExtractShortError = 'UNSUPPORTED_API' | 'ENCODING_ERROR' | 'MUX_FAILED'

/** Encuadre horizontal a aplicar al recortar un short — fijo (un solo offset para todo el tramo) o automático (trayectoria ya calculada por análisis de movimiento, ver MotionFramingAnalyzerPort). */
export type ShortFraming = { mode: 'fixed'; cropOffsetX: number } | { mode: 'auto'; keyframes: AutoFrameKeyframe[] }

/** Recorta [startMs, endMs) del render vigente del proyecto con el encuadre vertical pedido — nunca vuelve a decodificar los VideoAsset originales. */
export interface ShortExtractorPort {
  extract(render: Render, startMs: number, endMs: number, framing: ShortFraming): Promise<Result<Blob, ExtractShortError>>
}

export type AnalyzeMotionFramingError = 'UNSUPPORTED_API' | 'DECODE_FAILED'

export interface MotionFramingAnalyzerPort {
  /**
   * Analiza el movimiento dentro de [startMs, endMs) del render y devuelve una
   * trayectoria de offsets horizontales (0-1) a aplicar como crop a lo largo
   * del short, ignorando la región excludeRect (recuadro del avatar) si se
   * provee. atMs de cada keyframe es relativo al propio inicio del short.
   */
  analyze(
    render: Render,
    startMs: number,
    endMs: number,
    excludeRect: NormalizedRect | null,
  ): Promise<Result<AutoFrameKeyframe[], AnalyzeMotionFramingError>>
}
