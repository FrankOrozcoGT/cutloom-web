import type { Project } from '@domain/project'
import type { Result } from '@application/result'

export type ProjectStorageError = 'UNKNOWN_ERROR'

/** Errores de ProjectUseCase.delete: identifican en qué paso de la cascada de borrado falló, en vez de colapsar todo a un único código genérico que dificultaría rastrear el origen real. */
export type ProjectDeleteError =
  | ProjectStorageError
  | 'DELETE_TIMELINE_FAILED'
  | 'DELETE_SUBTITLES_FAILED'
  | 'DELETE_SHORTS_FAILED'
  | 'DELETE_PUBLISHING_FAILED'

export interface ProjectStorage {
  create(name: string): Promise<Result<Project, ProjectStorageError>>
  getAll(): Promise<Project[]>
  rename(id: string, name: string): Promise<Result<Project, ProjectStorageError>>
  updateDescription(id: string, description: string): Promise<Result<Project, ProjectStorageError>>
  delete(id: string): Promise<Result<void, ProjectStorageError>>
}
