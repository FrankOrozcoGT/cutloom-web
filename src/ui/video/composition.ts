import { ProjectUseCase } from '@application/project/ProjectUseCase'
import { UploadVideoUseCase } from '@application/video/UploadVideoUseCase'
import { VideoValidator } from '@application/video/VideoValidator'
import { FilePickerAdapter } from '@infrastructure/file/FilePickerAdapter'
import { IndexedDBAdapter } from '@infrastructure/storage/IndexedDBAdapter'
import { IndexedDBProjectAdapter } from '@infrastructure/storage/IndexedDBProjectAdapter'
import { ThumbnailGenerator } from '@infrastructure/video/ThumbnailGenerator'

export const filePicker = new FilePickerAdapter()
export const videoStorage = new IndexedDBAdapter()
export const projectStorage = new IndexedDBProjectAdapter()
export const uploadVideoUseCase = new UploadVideoUseCase(
  new VideoValidator(),
  videoStorage,
  new ThumbnailGenerator(),
)
export const projectUseCase = new ProjectUseCase(projectStorage, videoStorage)
