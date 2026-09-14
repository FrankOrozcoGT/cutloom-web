import { PublishingApiAdapter } from '@infrastructure/publishing/adapter'
import { httpClient } from '@infrastructure/http/client'

export const publishingApi = new PublishingApiAdapter(httpClient)
