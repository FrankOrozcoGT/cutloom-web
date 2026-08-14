import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Project } from '@domain/project'
import { Button } from '@ui/components/Button'
import { FormField } from '@ui/components/FormField'
import { projectUseCase } from '@ui/video/composition'

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [newProjectName, setNewProjectName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const loadProjects = useCallback(async () => {
    const stored = await projectUseCase.getAll()
    setProjects(stored)
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const handleCreate = useCallback(async () => {
    const name = newProjectName.trim()
    if (!name) return
    const result = await projectUseCase.create(name)
    if (result.ok) {
      setNewProjectName('')
      await loadProjects()
    }
  }, [newProjectName, loadProjects])

  const startRename = useCallback((project: Project) => {
    setEditingId(project.id)
    setEditingName(project.name)
  }, [])

  const cancelRename = useCallback(() => {
    setEditingId(null)
    setEditingName('')
  }, [])

  const confirmRename = useCallback(
    async (id: string) => {
      const name = editingName.trim()
      if (!name) {
        cancelRename()
        return
      }
      await projectUseCase.rename(id, name)
      cancelRename()
      await loadProjects()
    },
    [editingName, cancelRename, loadProjects],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await projectUseCase.delete(id)
      await loadProjects()
    },
    [loadProjects],
  )

  return (
    <div>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FormField
              label="Nuevo proyecto"
              id="new-project-name"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="Nombre del proyecto"
            />
          </div>
          <Button onClick={handleCreate} className="w-full sm:w-auto sm:shrink-0">
            Crear
          </Button>
        </div>

        {projects.length === 0 ? (
          <p className="text-text-muted">No hay proyectos todavía.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:py-3"
              >
                {editingId === project.id ? (
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className="flex-1 rounded-lg border border-border bg-bg px-3 py-2.5 text-text-strong outline-none focus:border-accent-border focus:ring-2 focus:ring-accent-bg"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => confirmRename(project.id)}
                        className="flex-1 rounded-lg px-3 py-2.5 text-sm text-accent hover:bg-accent-bg sm:flex-none"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        className="flex-1 rounded-lg px-3 py-2.5 text-sm text-text-muted hover:bg-surface-hover sm:flex-none"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Link
                      to={`/projects/${project.id}`}
                      className="flex-1 rounded-lg px-1 py-2 text-text-strong hover:underline"
                    >
                      {project.name}
                    </Link>
                    <div className="flex gap-1 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => startRename(project)}
                        className="rounded-lg px-3 py-2.5 text-sm text-text-muted hover:bg-surface-hover"
                      >
                        Renombrar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(project.id)}
                        className="rounded-lg px-3 py-2.5 text-sm text-danger hover:bg-danger-bg"
                      >
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
