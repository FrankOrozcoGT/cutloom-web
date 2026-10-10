import { PublishingUseCase } from '@application/publishing/PublishingUseCase'
import { PublishingApiAdapter } from '@infrastructure/publishing/adapter'
import { PublishingCapabilitiesAdapter } from '@infrastructure/publishing/capabilitiesAdapter'
import { IndexedDBPublishingAdapter } from '@infrastructure/publishing/storageAdapter'
import { TusUploadAdapter } from '@infrastructure/publishing/tusUploadAdapter'
import { PublishBlobStorage } from '@infrastructure/publishing/blobStorageAdapter'
import { httpClient } from '@infrastructure/http/client'

export const publishingApi = new PublishingApiAdapter(httpClient)
export const publishingCapabilities = new PublishingCapabilitiesAdapter(httpClient)
export const publishingStorage = new IndexedDBPublishingAdapter()
export const tusUploadAdapter = new TusUploadAdapter()
export const publishBlobStorage = new PublishBlobStorage()
export const publishingUseCase = new PublishingUseCase(publishingApi, publishingStorage, tusUploadAdapter)
