import { UploadVideoUseCase } from '@application/video/UploadVideoUseCase'
import { VideoValidator } from '@application/video/VideoValidator'
import { ProjectUseCase } from '@application/project/ProjectUseCase'
import { IndexedDBAdapter } from '@infrastructure/storage/IndexedDBAdapter'
import { IndexedDBProxyAdapter } from '@infrastructure/storage/IndexedDBProxyAdapter'
import { IndexedDBProjectAdapter } from '@infrastructure/storage/IndexedDBProjectAdapter'
import { IndexedDBTimelineAdapter } from '@infrastructure/storage/IndexedDBTimelineAdapter'
import { IndexedDBRenderAdapter } from '@infrastructure/storage/IndexedDBRenderAdapter'
import { IndexedDBSubtitlesAdapter } from '@infrastructure/storage/IndexedDBSubtitlesAdapter'
import { IndexedDBShortsAdapter } from '@infrastructure/storage/IndexedDBShortsAdapter'
import { IndexedDBPublishingAdapter } from '@infrastructure/publishing/storageAdapter'
import { DurationReaderAdapter } from '@infrastructure/video/DurationReaderAdapter'
import { ThumbnailGenerator } from '@infrastructure/video/ThumbnailGenerator'
import { ProxyGeneratorAdapter } from '@infrastructure/video/ProxyGeneratorAdapter'
import { FilePickerAdapter } from '@infrastructure/file/FilePickerAdapter'

export const videoStorage = new IndexedDBAdapter()
export const proxyStorage = new IndexedDBProxyAdapter()
export const projectStorage = new IndexedDBProjectAdapter()
export const timelineStorage = new IndexedDBTimelineAdapter()
export const renderStorage = new IndexedDBRenderAdapter()
export const subtitlesStorage = new IndexedDBSubtitlesAdapter()
export const shortsStorage = new IndexedDBShortsAdapter()
export const publishingStorageAdapter = new IndexedDBPublishingAdapter()

export const filePickerAdapter = new FilePickerAdapter()

export const uploadVideoUseCase = new UploadVideoUseCase(
  new VideoValidator(),
  videoStorage,
  proxyStorage,
  new ProxyGeneratorAdapter(),
  new ThumbnailGenerator(),
  new DurationReaderAdapter(),
)

export const projectUseCase = new ProjectUseCase(
  projectStorage,
  videoStorage,
  proxyStorage,
  timelineStorage,
  renderStorage,
  subtitlesStorage,
  shortsStorage,
  publishingStorageAdapter,
)
