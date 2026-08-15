import { findActiveClip, getTimelineDurationMs, type Timeline } from '@domain/timeline'
import type { VideoAsset } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { TimelineStorage } from '@application/timeline/ports'
import type { CanvasPort, MediaMuxerPort, VideoDecoderPort, VideoStorage } from './ports'
import type { ExportError, ExportOptions, ExportProgressListener, RenderSegment } from './exportTypes'

export class ExportProjectUseCase {
  private readonly storage: TimelineStorage
  private readonly videoStorage: VideoStorage
  private readonly decoder: VideoDecoderPort
  private readonly muxer: MediaMuxerPort
  private readonly composer: CanvasPort

  constructor(
    storage: TimelineStorage,
    videoStorage: VideoStorage,
    decoder: VideoDecoderPort,
    muxer: MediaMuxerPort,
    composer: CanvasPort,
  ) {
    this.storage = storage
    this.videoStorage = videoStorage
    this.decoder = decoder
    this.muxer = muxer
    this.composer = composer
  }

  async execute(
    projectId: string,
    options: ExportOptions,
    onProgress?: ExportProgressListener,
    signal?: AbortSignal,
  ): Promise<Result<Blob, ExportError>> {
    const prerequisitesError = this.validatePrerequisites()
    if (prerequisitesError) {
      return err(prerequisitesError)
    }

    if (signal?.aborted) {
      return err('ABORTED')
    }

    onProgress?.({ phase: 'loading', completedSegments: 0, totalSegments: 0 })

    const loadResult = await this.loadTimelineAndAssets(projectId)
    if (!loadResult.ok) {
      return err(loadResult.error)
    }
    const { timeline, assetsById } = loadResult.value

    const segmentsResult = this.buildRenderSegments(timeline, assetsById)
    if (!segmentsResult.ok) {
      return err(segmentsResult.error)
    }

    if (signal?.aborted) {
      return err('ABORTED')
    }

    return this.run(segmentsResult.value, options, onProgress, signal)
  }

  private async loadTimelineAndAssets(
    projectId: string,
  ): Promise<Result<{ timeline: Timeline; assetsById: Record<string, VideoAsset> }, ExportError>> {
    const timelineResult = await this.storage.getByProject(projectId)
    if (!timelineResult.ok) {
      return err('STORAGE_ERROR')
    }
    const timeline = timelineResult.value
    if (!timeline || timeline.tracks.every((track) => track.clips.length === 0)) {
      return err('EMPTY_TIMELINE')
    }

    const assets = await this.videoStorage.getByProject(projectId)
    const assetsById = Object.fromEntries(assets.map((asset) => [asset.id, asset]))

    return ok({ timeline, assetsById })
  }

  private buildRenderSegments(
    timeline: Timeline,
    assetsById: Record<string, VideoAsset>,
  ): Result<RenderSegment[], ExportError> {
    const durationMs = getTimelineDurationMs(timeline)
    if (durationMs <= 0) {
      return err('EMPTY_TIMELINE')
    }

    // Puntos donde puede cambiar el clip activo: el inicio y el fin de cada
    // clip de cualquier pista. Basta evaluar findActiveClip en cada inicio de
    // tramo para derivar los segmentos, sin muestrear el timeline ms a ms.
    const boundaries = new Set<number>([0, durationMs])
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        boundaries.add(clip.offsetMs)
        boundaries.add(clip.offsetMs + clip.durationMs)
      }
    }
    const sortedBoundaries = [...boundaries].filter((ms) => ms >= 0 && ms < durationMs).sort((a, b) => a - b)

    const segments: RenderSegment[] = []

    for (const boundaryMs of sortedBoundaries) {
      const nextBoundaryMs = sortedBoundaries.find((ms) => ms > boundaryMs) ?? durationMs
      const active = findActiveClip(timeline, boundaryMs)

      if (!active) {
        // Hueco en el timeline (sin clip activo en este tramo): se genera un
        // segmento "gap" que el compositor rellena con fondo negro, preservando
        // la duración total de salida en vez de acortar el video exportado.
        segments.push({
          kind: 'gap',
          outputStartMs: boundaryMs,
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
        outputStartMs: boundaryMs,
        outputDurationMs,
      })
    }

    if (segments.length === 0) {
      return err('EMPTY_TIMELINE')
    }

    return ok(segments)
  }

  private validatePrerequisites(): ExportError | null {
    const hasWebCodecs = typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined'
    const hasCanvas = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined'
    if (!hasWebCodecs || !hasCanvas) {
      return 'UNSUPPORTED_API'
    }
    return null
  }

  private async run(
    segments: RenderSegment[],
    options: ExportOptions,
    onProgress?: ExportProgressListener,
    signal?: AbortSignal,
  ): Promise<Result<Blob, ExportError>> {
    let hasAudio = false
    for (const segment of segments) {
      if (segment.kind === 'clip' && (await this.decoder.hasAudioTrack(segment))) {
        hasAudio = true
        break
      }
    }

    const startResult = await this.muxer.start(options, hasAudio)
    if (!startResult.ok) {
      return err(startResult.error)
    }

    onProgress?.({ phase: 'decoding', completedSegments: 0, totalSegments: segments.length })

    let completedSegments = 0
    for (const segment of segments) {
      if (signal?.aborted) {
        await this.muxer.abort()
        return err('ABORTED')
      }

      let writeError: ExportError | null = null

      if (segment.kind === 'gap') {
        this.composer.composeBlank(segment, { dimensions: { width: options.width, height: options.height } })

        // Un solo frame largo no alinea bien con el frameRate del track y algunos
        // reproductores lo scrubbean mostrando el último frame visible antes del gap.
        // Se generan frames negros a la cadencia de options.fps, igual que el video real.
        const frameDurationSeconds = 1 / options.fps
        const gapDurationSeconds = segment.outputDurationMs / 1000
        const gapStartSeconds = segment.outputStartMs / 1000
        const frameCount = Math.max(1, Math.round(gapDurationSeconds / frameDurationSeconds))

        for (let i = 0; i < frameCount; i += 1) {
          if (writeError || signal?.aborted) break
          const frameTimestamp = gapStartSeconds + i * frameDurationSeconds
          const remaining = gapDurationSeconds - i * frameDurationSeconds
          const duration = Math.min(frameDurationSeconds, remaining)
          const result = await this.muxer.writeVideoFrame(frameTimestamp, duration)
          if (!result.ok) {
            writeError = result.error
          }
        }
      } else {
        await this.decoder.decodeSegment(
          segment,
          async (frame, timestampSeconds, durationSeconds) => {
            if (writeError || signal?.aborted) return
            this.composer.compose(frame, segment, { dimensions: { width: options.width, height: options.height } })
            const result = await this.muxer.writeVideoFrame(timestampSeconds, durationSeconds)
            if (!result.ok) {
              writeError = result.error
            }
          },
          async (data, timestampSeconds) => {
            if (writeError || signal?.aborted) return
            const result = await this.muxer.writeAudioSample(data, timestampSeconds)
            if (!result.ok) {
              writeError = result.error
            }
          },
        )
      }

      if (writeError) {
        await this.muxer.abort()
        return err(writeError)
      }

      if (signal?.aborted) {
        await this.muxer.abort()
        return err('ABORTED')
      }

      completedSegments += 1
      onProgress?.({ phase: 'decoding', completedSegments, totalSegments: segments.length })
    }

    onProgress?.({ phase: 'muxing', completedSegments: segments.length, totalSegments: segments.length })

    const finalizeResult = await this.muxer.finalize()
    if (!finalizeResult.ok) {
      return err(finalizeResult.error)
    }

    onProgress?.({ phase: 'done', completedSegments: segments.length, totalSegments: segments.length })
    return ok(finalizeResult.value)
  }
}
