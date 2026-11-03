import type { Render } from '@domain/render'
import { err, ok, type Result } from '@application/result'

export type ExtractShortError = 'UNSUPPORTED_API' | 'ENCODING_ERROR' | 'MUX_FAILED'

export interface ShortExtractorPort {
  /** Recorta [startMs, endMs) del render (ya con subtítulos quemados) con el encuadre vertical pedido — nunca vuelve a decodificar los VideoAsset originales. */
  extract(render: Render, startMs: number, endMs: number, cropOffsetX: number): Promise<Result<Blob, ExtractShortError>>
}

/** Genera el video final de un short recortando el render vigente del proyecto — el render siempre existe en este punto (ver EnsureRenderUseCase). */
export class ExtractShortUseCase {
  private readonly extractor: ShortExtractorPort

  constructor(extractor: ShortExtractorPort) {
    this.extractor = extractor
  }

  async execute(render: Render, startMs: number, endMs: number, cropOffsetX: number): Promise<Result<Blob, ExtractShortError>> {
    const result = await this.extractor.extract(render, startMs, endMs, cropOffsetX)
    if (!result.ok) {
      return err(result.error)
    }
    return ok(result.value)
  }
}
