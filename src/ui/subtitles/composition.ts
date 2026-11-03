import { ExtractSubtitlesAudioUseCase } from '@application/subtitles/ExtractSubtitlesAudioUseCase'
import { GenerateSubtitlesAndRenderUseCase } from '@application/subtitles/GenerateSubtitlesAndRenderUseCase'
import { GenerateSubtitlesUseCase } from '@application/subtitles/GenerateSubtitlesUseCase'
import { GenerateRenderUseCase } from '@application/render/GenerateRenderUseCase'
import { IndexedDBSubtitlesAdapter } from '@infrastructure/storage/IndexedDBSubtitlesAdapter'
import { IndexedDBRenderAdapter } from '@infrastructure/storage/IndexedDBRenderAdapter'
import { AudioExtractionAdapter } from '@infrastructure/video/AudioExtractionAdapter'
import { WhisperAdapter } from '@infrastructure/subtitles/WhisperAdapter'
import { VideoDecoderAdapter } from '@infrastructure/video/VideoDecoderAdapter'
import { VideoEncoderAdapter } from '@infrastructure/video/VideoEncoderAdapter'
import { OffscreenCanvasCompositor } from '@infrastructure/video/OffscreenCanvasCompositor'
import { RenderEngineAdapter } from '@infrastructure/video/RenderEngineAdapter'
import { timelineStorage, videoStorage } from '@ui/video/composition'

export const subtitlesStorage = new IndexedDBSubtitlesAdapter()
export const renderStorage = new IndexedDBRenderAdapter()

export const extractSubtitlesAudioUseCase = new ExtractSubtitlesAudioUseCase(
  timelineStorage,
  videoStorage,
  new AudioExtractionAdapter(),
)

const compositor = new OffscreenCanvasCompositor()
const renderEngine = new RenderEngineAdapter(new VideoDecoderAdapter(), new VideoEncoderAdapter(compositor), compositor)

export const generateSubtitlesAndRenderUseCase = new GenerateSubtitlesAndRenderUseCase(
  new GenerateSubtitlesUseCase(new WhisperAdapter()),
  new GenerateRenderUseCase(renderEngine, renderStorage),
  timelineStorage,
  videoStorage,
  subtitlesStorage,
)
