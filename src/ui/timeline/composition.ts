import { ArrangeClipsUseCase } from '@application/timeline/ArrangeClipsUseCase'
import { IndexedDBTimelineAdapter } from '@infrastructure/storage/IndexedDBTimelineAdapter'

export const timelineStorage = new IndexedDBTimelineAdapter()
export const arrangeUseCase = new ArrangeClipsUseCase(timelineStorage)
