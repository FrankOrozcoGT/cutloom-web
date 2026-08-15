import { GenerateSubtitlesUseCase } from '@application/subtitles/GenerateSubtitlesUseCase'
import { AudioExtractionAdapter } from '@infrastructure/video/AudioExtractionAdapter'
import { WhisperAdapter } from '@infrastructure/subtitles/WhisperAdapter'
import { IndexedDBSubtitlesAdapter } from '@infrastructure/storage/IndexedDBSubtitlesAdapter'
import { timelineStorage } from '@ui/timeline/composition'
import { videoStorage } from '@ui/video/composition'

export const subtitlesStorage = new IndexedDBSubtitlesAdapter()
export const generateSubtitlesUseCase = new GenerateSubtitlesUseCase(
  timelineStorage,
  videoStorage,
  new AudioExtractionAdapter(),
  new WhisperAdapter(),
)
