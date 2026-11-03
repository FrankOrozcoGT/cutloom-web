import { err, ok, type Result } from '@application/result'

/** Sample rate compartido con la extracción de audio del render — el audio del timeline ya se extrae mono a esta frecuencia. */
export const TARGET_SAMPLE_RATE = 16000

/** Formato estándar de shorts verticales (YouTube Shorts, TikTok, Reels) — 1080x1920 9:16. Único punto de verdad: ShortExtractorAdapter (recorte real) y la UI de preview/edición de encuadre deben usar la misma proporción. */
export const SHORT_WIDTH = 1080
export const SHORT_HEIGHT = 1920

/** Rectángulo en coordenadas normalizadas (0-1, relativas al frame completo) — usado para marcar una región a excluir del análisis de auto-encuadre (ej. el recuadro de la webcam/avatar superpuesto). */
export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

/** Centro normalizado de un NormalizedRect — punto de reposo del auto-encuadre cuando no hay movimiento. */
export function normalizedRectCenter(rect: NormalizedRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

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
  renderId: string
  shorts: ShortScore[]
  warnings: string[]
}): ProjectShorts {
  return {
    projectId: params.projectId,
    renderId: params.renderId,
    shorts: params.shorts,
    warnings: params.warnings,
    createdAt: new Date().toISOString(),
  }
}

/** Un punto de la trayectoria de auto-encuadre: en qué momento del short (relativo a su propio inicio) corresponde este offset horizontal. */
export interface AutoFrameKeyframe {
  atMs: number
  cropOffsetX: number
}

/** Interpola el offset horizontal en atMs (relativo al inicio del short) entre los dos keyframes que lo rodean — keyframes vienen ordenados por atMs (ver smoothMotionPath/AnalyzeMotionFramingUseCase). Única fuente de verdad, usada tanto al reproducir en vivo como al quemar la trayectoria en la exportación final, para que ambos coincidan. */
export function interpolateCropOffsetX(keyframes: AutoFrameKeyframe[], atMs: number): number {
  if (keyframes.length === 0) return 0.5
  if (atMs <= keyframes[0].atMs) return keyframes[0].cropOffsetX
  const last = keyframes[keyframes.length - 1]
  if (atMs >= last.atMs) return last.cropOffsetX

  for (let i = 1; i < keyframes.length; i += 1) {
    if (keyframes[i].atMs >= atMs) {
      const previous = keyframes[i - 1]
      const next = keyframes[i]
      const span = next.atMs - previous.atMs
      const t = span === 0 ? 0 : (atMs - previous.atMs) / span
      return previous.cropOffsetX + (next.cropOffsetX - previous.cropOffsetX) * t
    }
  }
  return last.cropOffsetX
}

/** Resultado de crear shorts para un proyecto, persistido para que el listado de proyectos sepa si ya tiene shorts generados sin tener que entrar al editor. */
export interface ProjectShorts {
  projectId: string
  /** Render (ver domain/render.ts) sobre el que se recortaron estos shorts — si no coincide con el render vigente del proyecto, el timeline cambió y se generó un render nuevo después, así que los startMs/endMs guardados ya no corresponden al contenido vigente. */
  renderId: string
  shorts: ShortScore[]
  warnings: string[]
  shortIdeal?: ShortIdeal
  createdAt: string
  /** Offset horizontal de crop manual por short (0 = borde izquierdo visible, 0.5 = centrado, 1 = borde derecho visible), keyed por shortKey(). Ausente o sin entrada = centrado (default). Preferencia de UI, no del backend — vive acá y no en ShortScore para no mezclarla con la respuesta del scoring. */
  cropOffsetXByShort?: Record<string, number>
  /** Trayectoria de auto-encuadre ya calculada por short (ver findMotionCenter/smoothMotionPath), keyed por shortKey() — solo presente para shorts donde el usuario activó el auto-encuadre; si falta o autoFrameEnabled es false, se usa cropOffsetXByShort. */
  autoFramingByShort?: Record<string, AutoFrameKeyframe[]>
  /** Shorts con auto-encuadre activado por el usuario, keyed por shortKey(). Ausente o false = usa el offset fijo manual (cropOffsetXByShort). */
  autoFrameEnabledByShort?: Record<string, boolean>
  /** Región (recuadro de webcam/avatar superpuesto) a excluir del análisis de auto-encuadre — una sola por proyecto, el avatar no cambia de posición entre shorts del mismo video. Ausente = no excluir nada. */
  motionExcludeRect?: NormalizedRect
}

export interface ImproveResult {
  summary: string
  correctedSubtitles: ImprovedSubtitle[]
}

/**
 * Centro de masa del movimiento detectado en un frame de diferencia
 * (grayscale, un byte por pixel, mayor valor = mas cambio respecto al
 * frame anterior), ignorando por completo los pixeles dentro de
 * excludeRect. Devuelve null si no hay suficiente cambio detectado en
 * ningun pixel no excluido (frame estatico, o toda la actividad cae
 * dentro de la region excluida).
 */
export function findMotionCenter(
  diff: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  excludeRect: NormalizedRect | null,
): { x: number; y: number } | null {
  const excludeLeft = excludeRect ? Math.floor(excludeRect.x * width) : -1
  const excludeTop = excludeRect ? Math.floor(excludeRect.y * height) : -1
  const excludeRight = excludeRect ? Math.ceil((excludeRect.x + excludeRect.width) * width) : -1
  const excludeBottom = excludeRect ? Math.ceil((excludeRect.y + excludeRect.height) * height) : -1

  let totalWeight = 0
  let weightedX = 0
  let weightedY = 0

  for (let y = 0; y < height; y += 1) {
    const insideExcludeY = excludeRect !== null && y >= excludeTop && y < excludeBottom
    for (let x = 0; x < width; x += 1) {
      if (insideExcludeY && x >= excludeLeft && x < excludeRight) continue
      const value = diff[y * width + x]
      if (value < threshold) continue
      totalWeight += value
      weightedX += value * x
      weightedY += value * y
    }
  }

  if (totalWeight === 0) return null
  return { x: weightedX / totalWeight / width, y: weightedY / totalWeight / height }
}

/**
 * Suaviza una trayectoria cruda de centros de movimiento (uno por muestra
 * analizada) con media móvil exponencial + zona muerta: mientras el punto
 * nuevo esté dentro de deadZoneRadius del valor suavizado vigente, el
 * encuadre no se mueve — solo empieza a seguir cuando la actividad se
 * aleja lo suficiente. Evita que el crop tiemble ante ruido/microcambios
 * frame a frame, mismo patrón que usan los reframers reales (cámara que
 * hace paneo, no una que tiembla).
 *
 * Un hueco (null, sin movimiento detectado en esa muestra) no vuelve al
 * reposo de inmediato: hace falta que se sostenga durante restHoldSamples
 * muestras consecutivas (ver restHoldSamples) antes de que restPoint (el
 * centro de la región del avatar) se vuelva el destino — así una pausa
 * breve del cursor no dispara un viaje de ida y vuelta, solo lo hace una
 * pausa real. Una vez cumplido el hold, el regreso es gradual, con el mismo
 * EMA que sigue al movimiento real. Sin reposo definido, hueco inicial, o
 * movimiento real sostenido, no hay destino todavía y la muestra se omite.
 */
export function smoothMotionPath(
  points: ({ x: number; y: number } | null)[],
  emaAlpha: number,
  deadZoneRadius: number,
  restPoint: { x: number; y: number } | null,
  restHoldSamples: number,
): { x: number; y: number }[] {
  const smoothed: { x: number; y: number }[] = []
  let current: { x: number; y: number } | null = null
  let consecutiveGaps = 0

  for (const point of points) {
    consecutiveGaps = point === null ? consecutiveGaps + 1 : 0
    const target = point ?? (consecutiveGaps >= restHoldSamples ? restPoint : null)
    if (target === null) {
      if (current) smoothed.push(current)
      continue
    }
    if (current === null) {
      current = target
    } else {
      const distance = Math.hypot(target.x - current.x, target.y - current.y)
      if (point !== null && distance <= deadZoneRadius) {
        // movimiento real pero dentro de la zona muerta: no se mueve
      } else {
        current = {
          x: current.x + (target.x - current.x) * emaAlpha,
          y: current.y + (target.y - current.y) * emaAlpha,
        }
      }
    }
    smoothed.push(current)
  }

  return smoothed
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
