import type { Render } from '@domain/render'
import type { AutoFrameKeyframe } from '@domain/shorts'
import { err, ok, type Result } from '@application/result'

export type ExtractShortError = 'UNSUPPORTED_API' | 'ENCODING_ERROR' | 'MUX_FAILED'

/** Encuadre horizontal a aplicar al recortar un short — fijo (un solo offset para todo el tramo) o automático (trayectoria ya calculada por análisis de movimiento, ver AnalyzeMotionFramingUseCase). */
export type ShortFraming = { mode: 'fixed'; cropOffsetX: number } | { mode: 'auto'; keyframes: AutoFrameKeyframe[] }

export interface ShortExtractorPort {
  /** Recorta [startMs, endMs) del render (ya con subtítulos quemados) con el encuadre vertical pedido — nunca vuelve a decodificar los VideoAsset originales. */
  extract(render: Render, startMs: number, endMs: number, framing: ShortFraming): Promise<Result<Blob, ExtractShortError>>
}

/** Genera el video final de un short recortando el render vigente del proyecto — el render siempre existe en este punto (ver EnsureRenderUseCase). */
export class ExtractShortUseCase {
  private readonly extractor: ShortExtractorPort

  constructor(extractor: ShortExtractorPort) {
    this.extractor = extractor
  }

  async execute(render: Render, startMs: number, endMs: number, framing: ShortFraming): Promise<Result<Blob, ExtractShortError>> {
    const result = await this.extractor.extract(render, startMs, endMs, framing)
    if (!result.ok) {
      return err(result.error)
    }
    return ok(result.value)
  }
}
