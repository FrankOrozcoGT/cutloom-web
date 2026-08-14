import type { Project } from '@domain/project'
import { err, type Result } from '@application/result'
import type { StorageError, VideoStorage } from '@application/video/ports'
import type { ProjectStorage, ProjectStorageError } from './ports'

export class ProjectUseCase {
  private readonly projects: ProjectStorage
  private readonly videos: VideoStorage

  constructor(projects: ProjectStorage, videos: VideoStorage) {
    this.projects = projects
    this.videos = videos
  }

  create(name: string): Promise<Result<Project, ProjectStorageError>> {
    return this.projects.create(name)
  }

  getAll(): Promise<Project[]> {
    return this.projects.getAll()
  }

  rename(id: string, name: string): Promise<Result<Project, ProjectStorageError>> {
    return this.projects.rename(id, name)
  }

  async delete(id: string): Promise<Result<void, ProjectStorageError | StorageError>> {
    const deleteVideosResult = await this.videos.deleteByProject(id)
    if (!deleteVideosResult.ok) {
      return err(deleteVideosResult.error)
    }
    return this.projects.delete(id)
  }
}
