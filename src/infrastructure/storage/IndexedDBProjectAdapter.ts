import type { Project } from '@domain/project'
import { err, ok, type Result } from '@application/result'
import type { ProjectStorage, ProjectStorageError } from '@application/project/ports'
import { openCutloomDB, runReadModifyWrite, runTransaction, PROJECTS_STORE } from './database'

class NotFoundError extends Error {}

export class IndexedDBProjectAdapter implements ProjectStorage {
  async create(name: string): Promise<Result<Project, ProjectStorageError>> {
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    }

    try {
      const db = await openCutloomDB()
      await runTransaction(db, PROJECTS_STORE, 'readwrite', (store) => store.put(project))
      return ok(project)
    } catch {
      return err('UNKNOWN_ERROR')
    }
  }

  async getAll(): Promise<Project[]> {
    const db = await openCutloomDB()
    return runTransaction(db, PROJECTS_STORE, 'readonly', (store) => store.getAll())
  }

  /** Read-modify-write atómico (misma transacción IndexedDB, ver runReadModifyWrite) — dos rename/updateDescription concurrentes sobre el mismo proyecto ya no pueden pisarse (lost update). */
  private async patch(id: string, changes: Partial<Omit<Project, 'id'>>): Promise<Result<Project, ProjectStorageError>> {
    try {
      const db = await openCutloomDB()
      const updated = await runReadModifyWrite<Project>(db, PROJECTS_STORE, id, (existing) => {
        if (!existing) {
          throw new NotFoundError()
        }
        return { ...existing, ...changes }
      })
      return ok(updated)
    } catch {
      return err('UNKNOWN_ERROR')
    }
  }

  rename(id: string, name: string): Promise<Result<Project, ProjectStorageError>> {
    return this.patch(id, { name })
  }

  updateDescription(id: string, description: string): Promise<Result<Project, ProjectStorageError>> {
    return this.patch(id, { description })
  }

  async delete(id: string): Promise<Result<void, ProjectStorageError>> {
    try {
      const db = await openCutloomDB()
      await runTransaction(db, PROJECTS_STORE, 'readwrite', (store) => store.delete(id))
      return ok(undefined)
    } catch {
      return err('UNKNOWN_ERROR')
    }
  }
}
