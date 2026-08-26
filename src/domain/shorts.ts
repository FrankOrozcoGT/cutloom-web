import { err, ok, type Result } from '@application/result'

/** Sample rate compartido con AudioExtractionAdapter — el audio del timeline ya se extrae mono a esta frecuencia. */
export const TARGET_SAMPLE_RATE = 16000

export interface ShortCandidateDetect {
  startMs: number
  endMs: number
  confidence: number
  reason: string
}

export type DetectedCandidate = ShortCandidateDetect

export interface ImprovedSubtitle {
  startMs: number
  endMs: number
  original: string
  corrected: string
}

export interface ShortScore {
  startMs: number
  endMs: number
  confidence: number
  reason: string
  emotion: string | null
  score: number
}

export interface DetectResult {
  candidates: DetectedCandidate[]
}

export interface ScoreResult {
  shorts: ShortScore[]
  warnings: string[]
}

export interface ImproveResult {
  summary: string
  correctedSubtitles: ImprovedSubtitle[]
}

export type SliceError = 'INVALID_RANGE' | 'OUT_OF_BOUNDS'

/** Recorta un tramo [startMs, endMs) de audio mono a TARGET_SAMPLE_RATE. */
export function sliceAudioRange(
  audio: Float32Array,
  startMs: number,
  endMs: number,
): Result<Float32Array, SliceError> {
  if (startMs < 0 || endMs < 0 || startMs >= endMs) return err('INVALID_RANGE')

  const startSample = Math.floor((startMs / 1000) * TARGET_SAMPLE_RATE)
  const endSample = Math.ceil((endMs / 1000) * TARGET_SAMPLE_RATE)
  if (startSample >= audio.length || endSample > audio.length) return err('OUT_OF_BOUNDS')

  return ok(audio.slice(startSample, endSample))
}

/** Codifica un tramo de audio mono Float32 [-1,1] a WAV PCM16 (RIFF/fmt/data), little-endian. */
export function wavPcm16(audio: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = audio.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < audio.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, audio[i]))
    const sample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    view.setInt16(offset, sample, true)
    offset += bytesPerSample
  }

  return new Uint8Array(buffer)
}
