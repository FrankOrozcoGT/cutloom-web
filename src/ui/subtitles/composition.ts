import { ExtractSubtitlesAudioUseCase } from '@application/subtitles/ExtractSubtitlesAudioUseCase'
import { IndexedDBSubtitlesAdapter } from '@infrastructure/storage/IndexedDBSubtitlesAdapter'
import { AudioExtractionAdapter } from '@infrastructure/video/AudioExtractionAdapter'
import { timelineStorage } from '@ui/timeline/composition'
import { videoStorage } from '@ui/video/composition'

// GenerateSubtitlesUseCase (transcripción con Whisper) se instancia dentro de
// subtitles.worker.ts, no acá: corre en un Web Worker para no bloquear el
// hilo principal. La extracción de audio sí vive acá — depende de
// OfflineAudioContext (Web Audio API), que no existe dentro de un worker.
export const subtitlesStorage = new IndexedDBSubtitlesAdapter()
export const extractSubtitlesAudioUseCase = new ExtractSubtitlesAudioUseCase(
  timelineStorage,
  videoStorage,
  new AudioExtractionAdapter(),
)
