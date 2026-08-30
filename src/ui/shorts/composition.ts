import { DetectShortsUseCase } from '@application/shorts/DetectShortsUseCase'
import { ImproveSubtitlesUseCase } from '@application/shorts/ImproveSubtitlesUseCase'
import { ScoreShortsUseCase } from '@application/shorts/ScoreShortsUseCase'
import { ShortsApiAdapter } from '@infrastructure/shorts/adapter'
import { httpClient } from '@infrastructure/http/client'

export const shortsApi = new ShortsApiAdapter(httpClient)
export const improveSubtitlesUseCase = new ImproveSubtitlesUseCase(shortsApi)
export const detectShortsUseCase = new DetectShortsUseCase(shortsApi)
export const scoreShortsUseCase = new ScoreShortsUseCase(shortsApi)

export { extractSubtitlesAudioUseCase } from '@ui/subtitles/composition'
