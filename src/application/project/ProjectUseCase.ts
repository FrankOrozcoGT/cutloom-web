import type { Project } from '@domain/project'
import { err, type Result } from '@application/result'
import type { StorageError, VideoStorage } from '@application/video/ports'
import type { TimelineStorage } from '@application/timeline/ports'
import type { SubtitlesStoragePort } from '@application/subtitles/ports'
import type { ShortsStoragePort } from '@application/shorts/ports'
import type { ProjectDeleteError, ProjectStorage, ProjectStorageError } from './ports'

export class ProjectUseCase {
  private readonly projects: ProjectStorage
  private readonly videos: VideoStorage
  private readonly timelines: TimelineStorage
  private readonly subtitles: SubtitlesStoragePort
  private readonly shorts: ShortsStoragePort

  constructor(
    projects: ProjectStorage,
    videos: VideoStorage,
    timelines: TimelineStorage,
    subtitles: SubtitlesStoragePort,
    shorts: ShortsStoragePort,
  ) {
    this.projects = projects
    this.videos = videos
    this.timelines = timelines
    this.subtitles = subtitles
    this.shorts = shorts
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
   * subtítulos, shorts). Sin esto, un timeline/subtítulos viejo queda
   * huérfano en IndexedDB bajo el mismo projectId si se reutiliza el id o
   * se reinicia el proyecto para pruebas — y getByProject solo lee el
   * primer registro del índice, así que ese huérfano puede reaparecer con
   * clips fantasma. Cada paso se verifica: si cualquiera falla, se corta
   * ahí (no se sigue borrando ni se llega a borrar el proyecto en sí) en
   * vez de ignorar el error y reportar éxito con huérfanos parciales.
   */
  async delete(id: string): Promise<Result<void, ProjectDeleteError | StorageError>> {
    const deleteVideosResult = await this.videos.deleteByProject(id)
    if (!deleteVideosResult.ok) {
      return err(deleteVideosResult.error)
    }
    const deleteTimelineResult = await this.timelines.delete(id)
    if (!deleteTimelineResult.ok) {
      return err('DELETE_TIMELINE_FAILED')
    }
    const deleteSubtitlesResult = await this.subtitles.deleteByProject(id)
    if (!deleteSubtitlesResult.ok) {
      return err('DELETE_SUBTITLES_FAILED')
    }
    const deleteShortsResult = await this.shorts.deleteByProject(id)
    if (!deleteShortsResult.ok) {
      return err('DELETE_SHORTS_FAILED')
    }
    return this.projects.delete(id)
  }
}
