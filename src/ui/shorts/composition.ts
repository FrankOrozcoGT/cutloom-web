import { DetectShortsUseCase } from '@application/shorts/DetectShortsUseCase'
import { ScoreShortsUseCase } from '@application/shorts/ScoreShortsUseCase'
import { SaveShortsResultUseCase } from '@application/shorts/SaveShortsResultUseCase'
import { EnsureRenderUseCase, GenerateRenderUseCase } from '@application/render/GenerateRenderUseCase'
import { ShortsApiAdapter } from '@infrastructure/shorts/adapter'
import { ShortExtractorAdapter } from '@infrastructure/shorts/ShortExtractorAdapter'
import { MotionFramingAnalyzerAdapter } from '@infrastructure/shorts/MotionFramingAnalyzerAdapter'
import { httpClient } from '@infrastructure/http/client'
import { createRenderEngine } from '@infrastructure/video/createRenderEngine'
import { shortsStorage, videoStorage, renderStorage } from '@ui/video/composition'
import { timelineStorage } from '@ui/timeline/composition'

export const shortsApi = new ShortsApiAdapter(httpClient)
export const detectShortsUseCase = new DetectShortsUseCase(shortsApi)
export const scoreShortsUseCase = new ScoreShortsUseCase(shortsApi)

const ensureRenderUseCase = new EnsureRenderUseCase(renderStorage, new GenerateRenderUseCase(createRenderEngine(), renderStorage))

export const saveShortsResultUseCase = new SaveShortsResultUseCase(
  shortsStorage,
  timelineStorage,
  videoStorage,
  ensureRenderUseCase,
)
export const shortExtractor = new ShortExtractorAdapter()
export const motionFramingAnalyzer = new MotionFramingAnalyzerAdapter()

export { extractSubtitlesAudioUseCase } from '@ui/subtitles/composition'
