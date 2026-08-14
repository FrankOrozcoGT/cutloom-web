import type { Timeline } from '@domain/timeline'
import type { Result } from '@application/result'

export type TimelineStorageError = 'STORAGE_FULL' | 'CORRUPTED_DATA' | 'UNKNOWN_ERROR'

export interface TimelineStorage {
  getByProject(projectId: string): Promise<Result<Timeline | null, TimelineStorageError>>
  save(timeline: Timeline): Promise<Result<void, TimelineStorageError>>
  delete(projectId: string): Promise<Result<void, TimelineStorageError>>
}
