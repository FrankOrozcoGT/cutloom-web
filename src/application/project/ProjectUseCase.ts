import type { Project } from '@domain/project'
import { err, type Result } from '@application/result'
import type { StorageError, VideoStorage } from '@application/video/ports'
import type { TimelineStorage } from '@application/timeline/ports'
import type { SubtitlesStoragePort } from '@application/subtitles/ports'
import type { ProjectStorage, ProjectStorageError } from './ports'

export class ProjectUseCase {
  private readonly projects: ProjectStorage
  private readonly videos: VideoStorage
  private readonly timelines: TimelineStorage
  private readonly subtitles: SubtitlesStoragePort

  constructor(projects: ProjectStorage, videos: VideoStorage, timelines: TimelineStorage, subtitles: SubtitlesStoragePort) {
    this.projects = projects
    this.videos = videos
    this.timelines = timelines
    this.subtitles = subtitles
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

  updateDescription(id: string, description: string): Promise<Result<Project, ProjectStorageError>> {
    return this.projects.updateDescription(id, description)
  }

  /**
   * Borra el proyecto y todo lo que le pertenece (videos, timeline,
   * subtítulos). Sin esto, un timeline/subtítulos viejo queda huérfano en
   * IndexedDB bajo el mismo projectId si se reutiliza el id o se reinicia
   * el proyecto para pruebas — y getByProject solo lee el primer registro
   * del índice, así que ese huérfano puede reaparecer con clips fantasma.
   */
  async delete(id: string): Promise<Result<void, ProjectStorageError | StorageError>> {
    const deleteVideosResult = await this.videos.deleteByProject(id)
    if (!deleteVideosResult.ok) {
      return err(deleteVideosResult.error)
    }
    await this.timelines.delete(id)
    await this.subtitles.deleteByProject(id)
    return this.projects.delete(id)
  }
}
