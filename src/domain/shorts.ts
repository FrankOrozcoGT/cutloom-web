import { err, ok, type Result } from '@application/result'

/** Sample rate compartido con AudioExtractionAdapter — el audio del timeline ya se extrae mono a esta frecuencia. */
export const TARGET_SAMPLE_RATE = 16000

export interface ShortCandidateDetect {
  /** Id estable devuelto por /detect — se reenvía tal cual a /score (candidates y fieldname del audio audio_<id>), reemplaza la dependencia de la posición del candidato dentro del array. */
  id: string
  startMs: number
  endMs: number
  confidence: number
  reason: string
}

/** Preferencias opcionales del usuario para guiar detect/score — todo el objeto y cada campo son opcionales, el backend aplica sus propios defaults (targetDurationSeconds: 45, count: 8) cuando faltan. */
export interface ShortIdeal {
  topic?: string
  targetAudience?: string
  targetDurationSeconds?: number
  tone?: string
  count?: number
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

/** Identifica un short dentro de un ProjectShorts — startMs/endMs son estables mientras no se regeneren los shorts del proyecto. */
export function shortKey(short: Pick<ShortScore, 'startMs' | 'endMs'>): string {
  return `${short.startMs}-${short.endMs}`
}

/** Arma el registro a persistir tras generar shorts nuevos — única forma válida de construir un ProjectShorts desde cero, para que no haya dos callers armando el shape por su cuenta. */
export function buildProjectShorts(params: {
  projectId: string
  shorts: ShortScore[]
  warnings: string[]
  timelineFingerprint?: string
}): ProjectShorts {
  return {
    projectId: params.projectId,
    shorts: params.shorts,
    warnings: params.warnings,
    createdAt: new Date().toISOString(),
    timelineFingerprint: params.timelineFingerprint,
  }
}

/** Resultado de crear shorts para un proyecto, persistido para que el listado de proyectos sepa si ya tiene shorts generados sin tener que entrar al editor. */
export interface ProjectShorts {
  projectId: string
  shorts: ShortScore[]
  warnings: string[]
  shortIdeal?: ShortIdeal
  createdAt: string
  /** Huella del timeline (ver domain/timeline.timelineFingerprint) al momento de generar estos shorts — si no coincide con la huella actual, el timeline cambió después y los startMs/endMs guardados ya no corresponden al contenido real. */
  timelineFingerprint?: string
  /** Offset horizontal de crop manual por short (0 = borde izquierdo visible, 0.5 = centrado, 1 = borde derecho visible), keyed por shortKey(). Ausente o sin entrada = centrado (default). Preferencia de UI, no del backend — vive acá y no en ShortScore para no mezclarla con la respuesta del scoring. */
  cropOffsetXByShort?: Record<string, number>
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
