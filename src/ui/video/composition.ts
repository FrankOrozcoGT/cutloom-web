import { ProjectUseCase } from '@application/project/ProjectUseCase'
import { UploadVideoUseCase } from '@application/video/UploadVideoUseCase'
import { VideoValidator } from '@application/video/VideoValidator'
import { FilePickerAdapter } from '@infrastructure/file/FilePickerAdapter'
import { IndexedDBAdapter } from '@infrastructure/storage/IndexedDBAdapter'
import { IndexedDBProjectAdapter } from '@infrastructure/storage/IndexedDBProjectAdapter'
import { IndexedDBSubtitlesAdapter } from '@infrastructure/storage/IndexedDBSubtitlesAdapter'
import { IndexedDBTimelineAdapter } from '@infrastructure/storage/IndexedDBTimelineAdapter'
import { DurationReaderAdapter } from '@infrastructure/video/DurationReaderAdapter'
import { ThumbnailGenerator } from '@infrastructure/video/ThumbnailGenerator'

export const filePicker = new FilePickerAdapter()
export const videoStorage = new IndexedDBAdapter()
export const projectStorage = new IndexedDBProjectAdapter()
export const uploadVideoUseCase = new UploadVideoUseCase(
  new VideoValidator(),
  videoStorage,
  new ThumbnailGenerator(),
  new DurationReaderAdapter(),
)
// Instancia propia de los adaptadores de timeline/subtítulos (no los singletons
// de ui/timeline|subtitles/composition.ts) para evitar un ciclo de imports:
// subtitles/composition.ts ya importa videoStorage desde este módulo.
export const projectUseCase = new ProjectUseCase(
  projectStorage,
  videoStorage,
  new IndexedDBTimelineAdapter(),
  new IndexedDBSubtitlesAdapter(),
)
