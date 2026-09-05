import { DetectShortsUseCase } from '@application/shorts/DetectShortsUseCase'
import { ImproveSubtitlesUseCase } from '@application/shorts/ImproveSubtitlesUseCase'
import { ScoreShortsUseCase } from '@application/shorts/ScoreShortsUseCase'
import { SaveShortsResultUseCase } from '@application/shorts/SaveShortsResultUseCase'
import { ShortsApiAdapter } from '@infrastructure/shorts/adapter'
import { httpClient } from '@infrastructure/http/client'
import { shortsStorage } from '@ui/video/composition'
import { timelineStorage } from '@ui/timeline/composition'

export const shortsApi = new ShortsApiAdapter(httpClient)
export const improveSubtitlesUseCase = new ImproveSubtitlesUseCase(shortsApi)
export const detectShortsUseCase = new DetectShortsUseCase(shortsApi)
export const scoreShortsUseCase = new ScoreShortsUseCase(shortsApi)
export const saveShortsResultUseCase = new SaveShortsResultUseCase(shortsStorage, timelineStorage)

export { extractSubtitlesAudioUseCase } from '@ui/subtitles/composition'
