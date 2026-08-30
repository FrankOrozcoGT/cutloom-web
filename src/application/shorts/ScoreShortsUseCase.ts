import { sliceAudioRange, TARGET_SAMPLE_RATE, wavPcm16, type DetectedCandidate, type ScoreResult } from '@domain/shorts'
import { err, type Result } from '@application/result'
import type { AudioClip } from './ports'
import { ShortsError } from './errors'
import type { ShortsBackendPort } from './ports'

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export class ScoreShortsUseCase {
  private readonly backend: ShortsBackendPort

  constructor(backend: ShortsBackendPort) {
    this.backend = backend
  }

  async execute(
    projectId: string,
    audio: Float32Array,
    candidates: DetectedCandidate[],
    ideal?: string,
  ): Promise<Result<ScoreResult, ShortsError>> {
    if (candidates.length === 0) {
      return err(new ShortsError('EMPTY_CANDIDATES', 'No hay candidatos para calcular el score.'))
    }

    const audioClips: AudioClip[] = []
    for (const candidate of candidates) {
      const sliceResult = sliceAudioRange(audio, candidate.startMs, candidate.endMs)
      if (!sliceResult.ok) {
        return err(new ShortsError('INVALID_AUDIO_SEGMENT', `Rango de audio inválido para el candidato ${candidate.startMs}-${candidate.endMs}ms.`))
      }
      const wav = wavPcm16(sliceResult.value, TARGET_SAMPLE_RATE)
      audioClips.push({ startMs: candidate.startMs, endMs: candidate.endMs, audioB64: toBase64(wav) })
    }

    return this.backend.score(projectId, candidates, ideal, audioClips)
  }
}
