import type { Project } from '@domain/project'
import { err, ok, type Result } from '@application/result'
import type { ProjectStorage, ProjectStorageError } from '@application/project/ports'
import { openCutloomDB, runTransaction, PROJECTS_STORE } from './database'

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

  async rename(id: string, name: string): Promise<Result<Project, ProjectStorageError>> {
    try {
      const db = await openCutloomDB()
      const existing = await runTransaction(db, PROJECTS_STORE, 'readonly', (store) => store.get(id))
      if (!existing) {
        return err('UNKNOWN_ERROR')
      }
      const updated: Project = { ...existing, name }
      await runTransaction(db, PROJECTS_STORE, 'readwrite', (store) => store.put(updated))
      return ok(updated)
    } catch {
      return err('UNKNOWN_ERROR')
    }
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
