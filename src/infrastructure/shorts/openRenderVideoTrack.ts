import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import type { InputVideoTrack } from 'mediabunny'
import type { Render } from '@domain/render'

/** Abre el blob de un Render ya consolidado junto con su pista de video principal (videoTrack null si no tiene ninguna) — único punto de verdad para este patrón, ya que ambos callers (análisis de movimiento, extracción de shorts) operan sobre el mismo tipo de entrada (Render) y tratan la ausencia de pista como UNSUPPORTED_API. input se devuelve también porque ShortExtractorAdapter lo necesita para Conversion.init. */
export async function openRenderVideoTrack(render: Render): Promise<{ input: Input; videoTrack: InputVideoTrack | null }> {
  const input = new Input({ source: new BlobSource(render.blob), formats: ALL_FORMATS })
  const videoTrack = await input.getPrimaryVideoTrack()
  return { input, videoTrack }
}
