import { sliceAudioRange, TARGET_SAMPLE_RATE, wavPcm16, type DetectedCandidate, type ScoreResult, type ShortIdeal } from '@domain/shorts'
import { err, type Result } from '@application/result'
import type { AudioClip } from './ports'
import { ShortsError } from './errors'
import type { ShortsBackendPort } from './ports'

/** Límites del contrato de POST /api/shorts/score — validarlos acá evita gastar la llamada cuando ya se sabe que el backend la va a rechazar con 400. */
const MAX_AUDIO_CLIPS = 30
const MAX_AUDIO_CLIP_DURATION_MS = 180_000

export class ScoreShortsUseCase {
  private readonly backend: ShortsBackendPort

  constructor(backend: ShortsBackendPort) {
    this.backend = backend
  }

  async execute(
    audio: Float32Array,
    candidates: DetectedCandidate[],
    shortIdeal?: ShortIdeal,
  ): Promise<Result<ScoreResult, ShortsError>> {
    if (candidates.length === 0) {
      return err(new ShortsError('EMPTY_CANDIDATES', 'No hay candidatos para calcular el score.'))
    }
    if (candidates.length > MAX_AUDIO_CLIPS) {
      return err(new ShortsError('TOO_MANY_CLIPS', `Hay ${candidates.length} candidatos, el máximo es ${MAX_AUDIO_CLIPS}.`))
    }

    const audioClips: AudioClip[] = []
    for (const candidate of candidates) {
      if (candidate.endMs - candidate.startMs > MAX_AUDIO_CLIP_DURATION_MS) {
        return err(
          new ShortsError(
            'INVALID_AUDIO_SEGMENT',
            `El candidato ${candidate.startMs}-${candidate.endMs}ms dura más de ${MAX_AUDIO_CLIP_DURATION_MS / 1000}s.`,
          ),
        )
      }
      const sliceResult = sliceAudioRange(audio, candidate.startMs, candidate.endMs)
      if (!sliceResult.ok) {
        return err(new ShortsError('INVALID_AUDIO_SEGMENT', `Rango de audio inválido para el candidato ${candidate.startMs}-${candidate.endMs}ms.`))
      }
      const wav = wavPcm16(sliceResult.value, TARGET_SAMPLE_RATE)
      const audioBlob = new Blob([wav.slice()], { type: 'audio/wav' })
      audioClips.push({ startMs: candidate.startMs, endMs: candidate.endMs, audioBlob })
    }

    return this.backend.score(candidates, audioClips, shortIdeal)
  }
}
