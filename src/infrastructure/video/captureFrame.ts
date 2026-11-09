import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny'

/** Captura un frame estático de un video (blob MP4/WebM con pista de video) en atSeconds, decodificando con mediabunny (WebCodecs) — nunca un elemento <video> del DOM, cuyos decoders de hardware limitados varias instancias compitiendo a la vez pueden agotar. Devuelve null si el blob no tiene pista de video o no hay sample en ese instante. */
export async function captureFrame(blob: Blob, atSeconds: number): Promise<Blob | null> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  const track = await input.getPrimaryVideoTrack()
  if (!track) return null

  const sink = new VideoSampleSink(track)
  const sample = await sink.getSample(atSeconds)
  if (!sample) return null

  try {
    const canvas = document.createElement('canvas')
    canvas.width = sample.displayWidth
    canvas.height = sample.displayHeight
    const context = canvas.getContext('2d')
    if (!context) return null
    sample.draw(context, 0, 0)
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  } finally {
    sample.close()
  }
}
