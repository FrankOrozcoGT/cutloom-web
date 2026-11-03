import type { RenderEnginePort } from '@application/render/ports'
import { VideoDecoderAdapter } from './VideoDecoderAdapter'
import { VideoEncoderAdapter } from './VideoEncoderAdapter'
import { OffscreenCanvasCompositor } from './OffscreenCanvasCompositor'
import { RenderEngineAdapter } from './RenderEngineAdapter'

/**
 * Construye un RenderEngineAdapter con su cableado real (decoder + encoder +
 * compositor, el encoder y el motor comparten el mismo compositor) — cada
 * contexto de ejecución (hilo principal, export.worker, subtitles.worker)
 * necesita su propia instancia porque OffscreenCanvasCompositor no es
 * serializable entre workers, pero el cableado en sí es siempre el mismo.
 */
export function createRenderEngine(): RenderEnginePort {
  const compositor = new OffscreenCanvasCompositor()
  return new RenderEngineAdapter(new VideoDecoderAdapter(), new VideoEncoderAdapter(compositor), compositor)
}
