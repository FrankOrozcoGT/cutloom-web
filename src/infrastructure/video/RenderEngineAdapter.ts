import { estimateMaxCharsForCue, findActiveSubtitle, splitLongSubtitleCues, type SubtitleSegment } from '@domain/subtitles'
import { err, ok, type Result } from '@application/result'
import type {
  CanvasPort,
  MediaMuxerPort,
  RenderEngineError,
  RenderEnginePort,
  RenderOptions,
  RenderProgressListener,
  RenderSegment,
  VideoDecoderPort,
} from '@application/render/ports'

/** Renderiza SIEMPRE a partir de los VideoAsset originales, quemando los subtítulos pasados — es el único punto de la arquitectura que decodifica/codifica el original completo. */
export class RenderEngineAdapter implements RenderEnginePort {
  private readonly decoder: VideoDecoderPort
  private readonly muxer: MediaMuxerPort
  private readonly composer: CanvasPort

  constructor(decoder: VideoDecoderPort, muxer: MediaMuxerPort, composer: CanvasPort) {
    this.decoder = decoder
    this.muxer = muxer
    this.composer = composer
  }

  async render(
    segments: RenderSegment[],
    options: RenderOptions,
    subtitleSegments: SubtitleSegment[],
    onProgress?: RenderProgressListener,
  ): Promise<Result<Blob, RenderEngineError>> {
    const hasWebCodecs = typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined'
    const hasCanvas = typeof OffscreenCanvas !== 'undefined'
    if (!hasWebCodecs || !hasCanvas) {
      return err('UNSUPPORTED_API')
    }

    const maxCharsPerCue = estimateMaxCharsForCue(options.width, options.height)
    const cues = splitLongSubtitleCues(subtitleSegments, maxCharsPerCue)

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
      const writeError = await this.renderSegment(segment, options, cues)

      if (writeError) {
        await this.muxer.abort()
        return err(writeError)
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

  private async renderSegment(
    segment: RenderSegment,
    options: RenderOptions,
    subtitleSegments: SubtitleSegment[],
  ): Promise<RenderEngineError | null> {
    let writeError: RenderEngineError | null = null

    if (segment.kind === 'gap') {
      // Un solo frame largo no alinea bien con el frameRate del track — se
      // generan frames negros a la cadencia de options.fps, igual que el video real.
      const frameDurationSeconds = 1 / options.fps
      const gapDurationSeconds = segment.outputDurationMs / 1000
      const gapStartSeconds = segment.outputStartMs / 1000
      const frameCount = Math.max(1, Math.round(gapDurationSeconds / frameDurationSeconds))

      for (let i = 0; i < frameCount; i += 1) {
        if (writeError) break
        const frameTimestamp = gapStartSeconds + i * frameDurationSeconds
        const remaining = gapDurationSeconds - i * frameDurationSeconds
        const duration = Math.min(frameDurationSeconds, remaining)
        const activeSubtitle = findActiveSubtitle(subtitleSegments, frameTimestamp * 1000)
        this.composer.composeBlank({
          dimensions: { width: options.width, height: options.height },
          subtitleText: activeSubtitle?.text,
        })
        const result = await this.muxer.writeVideoFrame(frameTimestamp, duration)
        if (!result.ok) {
          writeError = result.error
        }
      }
      return writeError
    }

    await this.decoder.decodeSegment(
      segment,
      async (frame, timestampSeconds, durationSeconds) => {
        if (writeError) return
        const activeSubtitle = findActiveSubtitle(subtitleSegments, timestampSeconds * 1000)
        this.composer.compose(frame, {
          dimensions: { width: options.width, height: options.height },
          subtitleText: activeSubtitle?.text,
        })
        const result = await this.muxer.writeVideoFrame(timestampSeconds, durationSeconds)
        if (!result.ok) {
          writeError = result.error
        }
      },
      async (data, timestampSeconds) => {
        if (writeError) return
        const result = await this.muxer.writeAudioSample(data, timestampSeconds)
        if (!result.ok) {
          writeError = result.error
        }
      },
    )

    return writeError
  }
}
