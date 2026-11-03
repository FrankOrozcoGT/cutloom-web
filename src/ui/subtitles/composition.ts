import { ExtractSubtitlesAudioUseCase } from '@application/subtitles/ExtractSubtitlesAudioUseCase'
import { GenerateSubtitlesAndRenderUseCase } from '@application/subtitles/GenerateSubtitlesAndRenderUseCase'
import { GenerateSubtitlesUseCase } from '@application/subtitles/GenerateSubtitlesUseCase'
import { GenerateRenderUseCase } from '@application/render/GenerateRenderUseCase'
import { IndexedDBSubtitlesAdapter } from '@infrastructure/storage/IndexedDBSubtitlesAdapter'
import { IndexedDBRenderAdapter } from '@infrastructure/storage/IndexedDBRenderAdapter'
import { AudioExtractionAdapter } from '@infrastructure/video/AudioExtractionAdapter'
import { WhisperAdapter } from '@infrastructure/subtitles/WhisperAdapter'
import { createRenderEngine } from '@infrastructure/video/createRenderEngine'
import { videoStorage } from '@ui/video/composition'
import { timelineStorage } from '@ui/timeline/composition'

export const subtitlesStorage = new IndexedDBSubtitlesAdapter()
export const renderStorage = new IndexedDBRenderAdapter()

export const extractSubtitlesAudioUseCase = new ExtractSubtitlesAudioUseCase(
  timelineStorage,
  videoStorage,
  new AudioExtractionAdapter(),
)

export const generateSubtitlesAndRenderUseCase = new GenerateSubtitlesAndRenderUseCase(
  new GenerateSubtitlesUseCase(new WhisperAdapter()),
  new GenerateRenderUseCase(createRenderEngine(), renderStorage),
  timelineStorage,
  videoStorage,
  subtitlesStorage,
)
