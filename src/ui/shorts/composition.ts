import { DetectShortsUseCase } from '@application/shorts/DetectShortsUseCase'
import { ScoreShortsUseCase } from '@application/shorts/ScoreShortsUseCase'
import { SaveShortsResultUseCase } from '@application/shorts/SaveShortsResultUseCase'
import { EnsureRenderUseCase, GenerateRenderUseCase } from '@application/render/GenerateRenderUseCase'
import { ShortsApiAdapter } from '@infrastructure/shorts/adapter'
import { ShortExtractorAdapter } from '@infrastructure/shorts/ShortExtractorAdapter'
import { MotionFramingAnalyzerAdapter } from '@infrastructure/shorts/MotionFramingAnalyzerAdapter'
import { httpClient } from '@infrastructure/http/client'
import { IndexedDBRenderAdapter } from '@infrastructure/storage/IndexedDBRenderAdapter'
import { VideoDecoderAdapter } from '@infrastructure/video/VideoDecoderAdapter'
import { VideoEncoderAdapter } from '@infrastructure/video/VideoEncoderAdapter'
import { OffscreenCanvasCompositor } from '@infrastructure/video/OffscreenCanvasCompositor'
import { RenderEngineAdapter } from '@infrastructure/video/RenderEngineAdapter'
import { shortsStorage, videoStorage } from '@ui/video/composition'
import { timelineStorage } from '@ui/timeline/composition'

export const shortsApi = new ShortsApiAdapter(httpClient)
export const detectShortsUseCase = new DetectShortsUseCase(shortsApi)
export const scoreShortsUseCase = new ScoreShortsUseCase(shortsApi)

const renderStorage = new IndexedDBRenderAdapter()
const compositor = new OffscreenCanvasCompositor()
const renderEngine = new RenderEngineAdapter(new VideoDecoderAdapter(), new VideoEncoderAdapter(compositor), compositor)
const ensureRenderUseCase = new EnsureRenderUseCase(renderStorage, new GenerateRenderUseCase(renderEngine, renderStorage))

export const saveShortsResultUseCase = new SaveShortsResultUseCase(
  shortsStorage,
  timelineStorage,
  videoStorage,
  ensureRenderUseCase,
)
export const shortExtractor = new ShortExtractorAdapter()
export const motionFramingAnalyzer = new MotionFramingAnalyzerAdapter()

export { extractSubtitlesAudioUseCase } from '@ui/subtitles/composition'
