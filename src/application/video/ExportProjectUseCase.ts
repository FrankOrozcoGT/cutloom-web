import { estimateMaxCharsForCue, findActiveSubtitle, splitLongSubtitleCues, type SubtitleSegment } from '@domain/subtitles'
import { err, ok, type Result } from '@application/result'
import type { TimelineStorage } from '@application/timeline/ports'
import type { SubtitlesStoragePort } from '@application/subtitles/ports'
import type { CanvasPort, MediaMuxerPort, VideoDecoderPort, VideoStorage } from './ports'
import {
  buildRenderSegments,
  loadTimelineAndAssets,
  type ExportError,
  type ExportOptions,
  type ExportProgressListener,
  type RenderSegment,
} from './exportTypes'

export class ExportProjectUseCase {
  private readonly storage: TimelineStorage
  private readonly videoStorage: VideoStorage
  private readonly decoder: VideoDecoderPort
  private readonly muxer: MediaMuxerPort
  private readonly composer: CanvasPort
  private readonly subtitlesStorage: SubtitlesStoragePort

  constructor(
    storage: TimelineStorage,
    videoStorage: VideoStorage,
    decoder: VideoDecoderPort,
    muxer: MediaMuxerPort,
    composer: CanvasPort,
    subtitlesStorage: SubtitlesStoragePort,
  ) {
    this.storage = storage
    this.videoStorage = videoStorage
    this.decoder = decoder
    this.muxer = muxer
    this.composer = composer
    this.subtitlesStorage = subtitlesStorage
  }

  async execute(
    projectId: string,
    options: ExportOptions,
    onProgress?: ExportProgressListener,
    signal?: AbortSignal,
    range?: { startMs: number; endMs: number },
    cropOffsetX?: number,
  ): Promise<Result<Blob, ExportError>> {
    const prerequisitesError = this.validatePrerequisites()
    if (prerequisitesError) {
      return err(prerequisitesError)
    }

    if (signal?.aborted) {
      return err('ABORTED')
    }

    onProgress?.({ phase: 'loading', completedSegments: 0, totalSegments: 0 })

    const loadResult = await loadTimelineAndAssets(this.storage, this.videoStorage, projectId)
    if (!loadResult.ok) {
      return err(loadResult.error === 'STORAGE_ERROR' ? 'STORAGE_ERROR' : 'EMPTY_TIMELINE')
    }
    const { timeline, assetsById } = loadResult.value

    const segmentsResult = buildRenderSegments(timeline, assetsById, range)
    if (!segmentsResult.ok) {
      return err(segmentsResult.error)
    }

    if (signal?.aborted) {
      return err('ABORTED')
    }

    // Los subtítulos son opcionales: si no hay ninguno guardado, se exporta sin
    // burn-in en vez de fallar toda la exportación por STORAGE_ERROR.
    const subtitlesResult = await this.subtitlesStorage.getByProject(projectId)
    const rawSubtitleSegments = subtitlesResult.ok ? (subtitlesResult.value?.segments ?? []) : []

    // Un SubtitleSegment de Whisper suele cubrir una oración completa —
    // demasiado texto para un solo frame, sobre todo en 9:16 (ancho angosto).
    // Se re-segmenta en cues cortos antes de quemarlos, con el límite de
    // caracteres derivado del tamaño real del canvas destino (mismo cálculo
    // que usa el preview) en vez de un número fijo desalineado del estilo.
    const maxCharsPerCue = estimateMaxCharsForCue(options.width, options.height)
    const subtitleSegments = splitLongSubtitleCues(rawSubtitleSegments, maxCharsPerCue)

    // Los timestamps de salida quedan reindexados a 0 por buildRenderSegments
    // cuando hay range, pero subtitleSegments sigue en tiempo del timeline
    // completo — hay que sumar el offset al buscar el subtítulo activo.
    return this.run(segmentsResult.value, options, subtitleSegments, range?.startMs ?? 0, cropOffsetX, onProgress, signal)
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
    subtitleSegments: SubtitleSegment[],
    subtitleTimeOffsetMs: number,
    cropOffsetX: number | undefined,
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
          const activeSubtitle = findActiveSubtitle(subtitleSegments, frameTimestamp * 1000 + subtitleTimeOffsetMs)
          this.composer.composeBlank(segment, {
            dimensions: { width: options.width, height: options.height },
            subtitleText: activeSubtitle?.text,
            cropOffsetX,
          })
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
            const activeSubtitle = findActiveSubtitle(subtitleSegments, timestampSeconds * 1000 + subtitleTimeOffsetMs)
            this.composer.compose(frame, segment, {
              dimensions: { width: options.width, height: options.height },
              subtitleText: activeSubtitle?.text,
              cropOffsetX,
            })
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
