import type { Project } from '@domain/project'
import type { Result } from '@application/result'

export type ProjectStorageError = 'UNKNOWN_ERROR'

export interface ProjectStorage {
  create(name: string): Promise<Result<Project, ProjectStorageError>>
  getAll(): Promise<Project[]>
  rename(id: string, name: string): Promise<Result<Project, ProjectStorageError>>
  updateDescription(id: string, description: string): Promise<Result<Project, ProjectStorageError>>
  delete(id: string): Promise<Result<void, ProjectStorageError>>
}
