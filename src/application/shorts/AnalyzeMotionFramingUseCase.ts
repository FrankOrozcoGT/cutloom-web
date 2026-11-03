import type { Render } from '@domain/render'
import type { AutoFrameKeyframe, NormalizedRect } from '@domain/shorts'
import { err, ok, type Result } from '@application/result'

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

export class AnalyzeMotionFramingUseCase {
  private readonly analyzer: MotionFramingAnalyzerPort

  constructor(analyzer: MotionFramingAnalyzerPort) {
    this.analyzer = analyzer
  }

  async execute(
    render: Render,
    startMs: number,
    endMs: number,
    excludeRect: NormalizedRect | null,
  ): Promise<Result<AutoFrameKeyframe[], AnalyzeMotionFramingError>> {
    const result = await this.analyzer.analyze(render, startMs, endMs, excludeRect)
    if (!result.ok) {
      return err(result.error)
    }
    return ok(result.value)
  }
}
