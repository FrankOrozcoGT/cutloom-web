import { findActiveClip, getTimelineDurationMs, type Timeline } from '@domain/timeline'
import type { VideoAsset, VideoFormat } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { TimelineStorage } from '@application/timeline/ports'
import type { VideoStorage } from './ports'

export interface ExportOptions {
  format: VideoFormat
  fps: number
  width: number
  height: number
}

/** Extensión de archivo para el formato exportado — único punto de verdad reusado por descarga manual y publicación en YouTube. */
export function fileExtensionFor(format: VideoFormat): string {
  return format === 'video/mp4' ? 'mp4' : 'webm'
}

/** Export landscape por defecto — usado para el video completo del timeline (descarga manual y publicación del item 'long'). */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'video/webm',
  fps: 30,
  width: 1280,
  height: 720,
}

// Formato estándar de shorts verticales (YouTube Shorts, TikTok, Reels):
// 1080x1920 9:16. El compositor de export rellena con blur el espacio que
// deja el video horizontal original en vez de recortarlo o deformarlo.
// Único punto de verdad — ShortCard (descarga manual) y usePublishYouTube
// (publicar en YouTube) deben producir el mismo recorte para el mismo short.
export const SHORT_EXPORT_OPTIONS: ExportOptions = {
  format: 'video/mp4',
  fps: 30,
  width: 1080,
  height: 1920,
}

export interface ClipRenderSegment {
  kind: 'clip'
  clipId: string
  assetId: string
  asset: VideoAsset
  sourceStartMs: number
  sourceEndMs: number
  outputStartMs: number
  outputDurationMs: number
}

/** Tramo del timeline sin ningún clip activo: se rellena con un fondo negro en la salida. */
export interface GapRenderSegment {
  kind: 'gap'
  outputStartMs: number
  outputDurationMs: number
}

export type RenderSegment = ClipRenderSegment | GapRenderSegment

export type ExportPhase = 'loading' | 'decoding' | 'encoding' | 'muxing' | 'done'

export interface ExportProgressEvent {
  phase: ExportPhase
  completedSegments: number
  totalSegments: number
}

export type ExportProgressListener = (event: ExportProgressEvent) => void

export type ExportError =
  | 'EMPTY_TIMELINE'
  | 'MISSING_ASSET'
  | 'UNSUPPORTED_API'
  | 'UNSUPPORTED_CODEC'
  | 'MUX_FAILED'
  | 'ENCODING_ERROR'
  | 'INSUFFICIENT_MEMORY'
  | 'STORAGE_ERROR'
  | 'ABORTED'

export type BuildRenderSegmentsError = 'EMPTY_TIMELINE' | 'MISSING_ASSET'
export type LoadTimelineError = 'EMPTY_TIMELINE' | 'STORAGE_ERROR'

/**
 * Carga el timeline de un proyecto junto con los assets que referencia, indexados
 * por id. Compartida por exportación y generación de subtítulos: ambas parten
 * del mismo timeline persistido antes de derivar sus propios segmentos.
 */
export async function loadTimelineAndAssets(
  timelineStorage: TimelineStorage,
  videoStorage: VideoStorage,
  projectId: string,
): Promise<Result<{ timeline: Timeline; assetsById: Record<string, VideoAsset> }, LoadTimelineError>> {
  const timelineResult = await timelineStorage.getByProject(projectId)
  if (!timelineResult.ok) {
    return err('STORAGE_ERROR')
  }
  const timeline = timelineResult.value
  if (!timeline || timeline.tracks.every((track) => track.clips.length === 0)) {
    return err('EMPTY_TIMELINE')
  }

  const assets = await videoStorage.getByProject(projectId)
  const assetsById = Object.fromEntries(assets.map((asset) => [asset.id, asset]))

  return ok({ timeline, assetsById })
}

/**
 * Deriva la secuencia de tramos (clip recortado o hueco) que compone la salida
 * final del timeline, en orden. Compartida por exportación y generación de
 * subtítulos: ambas necesitan saber exactamente qué material (y en qué orden)
 * corresponde a cada posición del timeline compuesto.
 *
 * range acota la salida a [range.startMs, range.endMs) del timeline (usado al
 * exportar un short) — outputStartMs queda reindexado a 0 en ese caso, para
 * que la salida siempre empiece en el origen sin importar dónde vivía el
 * recorte dentro del timeline completo.
 */
export function buildRenderSegments(
  timeline: Timeline,
  assetsById: Record<string, VideoAsset>,
  range?: { startMs: number; endMs: number },
): Result<RenderSegment[], BuildRenderSegmentsError> {
  const timelineDurationMs = getTimelineDurationMs(timeline)
  if (timelineDurationMs <= 0) {
    return err('EMPTY_TIMELINE')
  }

  const rangeStartMs = range ? Math.max(0, range.startMs) : 0
  const durationMs = range ? Math.min(range.endMs, timelineDurationMs) : timelineDurationMs
  if (durationMs <= rangeStartMs) {
    return err('EMPTY_TIMELINE')
  }

  // Puntos donde puede cambiar el clip activo: el inicio y el fin de cada
  // clip de cualquier pista. Basta evaluar findActiveClip en cada inicio de
  // tramo para derivar los segmentos, sin muestrear el timeline ms a ms.
  const boundaries = new Set<number>([rangeStartMs, durationMs])
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      boundaries.add(clip.offsetMs)
      boundaries.add(clip.offsetMs + clip.durationMs)
    }
  }
  const sortedBoundaries = [...boundaries]
    .filter((ms) => ms >= rangeStartMs && ms < durationMs)
    .sort((a, b) => a - b)

  const segments: RenderSegment[] = []

  for (const boundaryMs of sortedBoundaries) {
    const nextBoundaryMs = sortedBoundaries.find((ms) => ms > boundaryMs) ?? durationMs
    const active = findActiveClip(timeline, boundaryMs)
    const outputStartMs = boundaryMs - rangeStartMs

    if (!active) {
      // Hueco en el timeline (sin clip activo en este tramo): se genera un
      // segmento "gap" que el compositor rellena con fondo negro, preservando
      // la duración total de salida en vez de acortar el video exportado.
      segments.push({
        kind: 'gap',
        outputStartMs,
        outputDurationMs: nextBoundaryMs - boundaryMs,
      })
      continue
    }

    const asset = assetsById[active.clip.assetId]
    if (!asset) {
      return err('MISSING_ASSET')
    }

    const clipEndMs = active.clip.offsetMs + active.clip.durationMs
    const segmentEndMs = Math.min(clipEndMs, nextBoundaryMs, durationMs)
    const outputDurationMs = segmentEndMs - boundaryMs

    segments.push({
      kind: 'clip',
      clipId: active.clip.id,
      assetId: active.clip.assetId,
      asset,
      sourceStartMs: active.sourceTimeMs,
      sourceEndMs: active.sourceTimeMs + outputDurationMs,
      outputStartMs,
      outputDurationMs,
    })
  }

  if (segments.length === 0) {
    return err('EMPTY_TIMELINE')
  }

  return ok(segments)
}
