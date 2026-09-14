import { PublishingApiAdapter } from '@infrastructure/publishing/adapter'
import { IndexedDBPublishingAdapter } from '@infrastructure/publishing/storageAdapter'
import { httpClient } from '@infrastructure/http/client'

export const publishingApi = new PublishingApiAdapter(httpClient)
export const publishingStorage = new IndexedDBPublishingAdapter()
