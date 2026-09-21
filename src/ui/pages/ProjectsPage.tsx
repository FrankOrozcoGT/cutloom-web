import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clapperboard, FileText, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import type { Project } from '@domain/project'
import type { ProjectDeleteError } from '@application/project/ports'
import type { StorageError } from '@application/video/ports'
import { Button } from '@ui/components/Button'
import { ConfirmDialog } from '@ui/components/ConfirmDialog'
import { EditDescriptionDialog } from '@ui/components/EditDescriptionDialog'
import { ErrorBanner } from '@ui/components/ErrorBanner'
import { FormField } from '@ui/components/FormField'
import { projectUseCase, shortsStorage } from '@ui/video/composition'

const PROJECT_ERROR_MESSAGES: Record<ProjectDeleteError | StorageError, string> = {
  UNKNOWN_ERROR: 'Ocurrió un error inesperado.',
  STORAGE_FULL: 'No hay espacio suficiente de almacenamiento.',
  DELETE_TIMELINE_FAILED: 'No se pudo eliminar el timeline del proyecto.',
  DELETE_SUBTITLES_FAILED: 'No se pudieron eliminar los subtítulos del proyecto.',
  DELETE_SHORTS_FAILED: 'No se pudieron eliminar los shorts del proyecto.',
  DELETE_PUBLISHING_FAILED: 'No se pudo eliminar el estado de publicación del proyecto.',
}

// Dos mecanismos genuinamente distintos (navegar vs. ejecutar un handler in
// situ), no variantes de contenido de un mismo caso — de ahí el discriminante
// `kind` en vez de forzar todas las acciones a la forma de botón con un
// onClick vacío para la que en realidad es un link.
type ProjectAction =
  | { kind: 'button'; icon: typeof FileText; label: string; onClick: () => void; activeColor: boolean; danger?: boolean }
  | { kind: 'link'; icon: typeof FileText; label: string; to: string; activeColor: boolean }

function projectActions(
  project: Project,
  hasShorts: boolean,
  handlers: {
    onEditDescription: () => void
    onRename: () => void
    onDelete: () => void
  },
): ProjectAction[] {
  const actions: ProjectAction[] = [
    {
      kind: 'button',
      icon: FileText,
      label: 'Ver/editar resumen',
      onClick: handlers.onEditDescription,
      activeColor: !!project.description,
    },
    { kind: 'button', icon: Pencil, label: 'Renombrar', onClick: handlers.onRename, activeColor: false },
    { kind: 'button', icon: Trash2, label: 'Eliminar', onClick: handlers.onDelete, activeColor: false, danger: true },
  ]
  if (hasShorts) {
    actions.unshift({ kind: 'link', icon: Clapperboard, label: 'Ver shorts', to: `/projects/${project.id}/shorts`, activeColor: true })
  }
  return actions
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectIdsWithShorts, setProjectIdsWithShorts] = useState<Set<string>>(new Set())
  const [newProjectName, setNewProjectName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingDescriptionProject, setEditingDescriptionProject] = useState<Project | null>(null)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    const stored = await projectUseCase.getAll()
    setProjects(stored)
    const result = await shortsStorage.getProjectIdsWithShorts()
    setProjectIdsWithShorts(result.ok ? result.value : new Set())
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
      const result = await projectUseCase.rename(id, name)
      cancelRename()
      if (!result.ok) {
        setActionError(PROJECT_ERROR_MESSAGES[result.error])
        return
      }
      setActionError(null)
      await loadProjects()
    },
    [editingName, cancelRename, loadProjects],
  )

  const confirmDelete = useCallback(async () => {
    if (!deletingProject) return
    const result = await projectUseCase.delete(deletingProject.id)
    setDeletingProject(null)
    if (!result.ok) {
      setActionError(PROJECT_ERROR_MESSAGES[result.error])
      return
    }
    setActionError(null)
    await loadProjects()
  }, [deletingProject, loadProjects])

  const handleSaveDescription = useCallback(
    async (value: string) => {
      if (!editingDescriptionProject) return
      const result = await projectUseCase.updateDescription(editingDescriptionProject.id, value)
      setEditingDescriptionProject(null)
      if (!result.ok) {
        setActionError(PROJECT_ERROR_MESSAGES[result.error])
        return
      }
      setActionError(null)
      await loadProjects()
    },
    [editingDescriptionProject, loadProjects],
  )

  return (
    <div>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        {actionError && <ErrorBanner>{actionError}</ErrorBanner>}

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
            {projects.map((project) => {
              const hasShorts = projectIdsWithShorts.has(project.id)
              const actions = projectActions(project, hasShorts, {
                onEditDescription: () => setEditingDescriptionProject(project),
                onRename: () => startRename(project),
                onDelete: () => setDeletingProject(project),
              })

              return (
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

                      {/* Desktop: cada acción es su propio ícono en fila. */}
                      <div className="hidden items-center gap-1 sm:flex">
                        {actions.map((action) =>
                          action.kind === 'link' ? (
                            <Link
                              key={action.label}
                              to={action.to}
                              title={action.label}
                              aria-label={action.label}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-accent hover:bg-surface-hover"
                            >
                              <action.icon className="h-4 w-4" />
                            </Link>
                          ) : (
                            <button
                              key={action.label}
                              type="button"
                              onClick={action.onClick}
                              title={action.label}
                              aria-label={action.label}
                              className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-hover ${
                                action.danger ? 'text-danger hover:bg-danger-bg' : action.activeColor ? 'text-accent' : 'text-text-muted'
                              }`}
                            >
                              <action.icon className="h-4 w-4" />
                            </button>
                          ),
                        )}
                      </div>

                      {/* Mobile: mismas acciones colapsadas en un menú kebab — cuatro íconos no entran cómodos en una fila angosta. */}
                      <details className="relative self-end sm:hidden">
                        <summary
                          title="Más acciones"
                          aria-label="Más acciones"
                          className="flex h-9 w-9 list-none items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </summary>
                        <div className="absolute right-0 z-10 mt-1 flex w-44 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                          {actions.map((action) =>
                            action.kind === 'link' ? (
                              <Link
                                key={action.label}
                                to={action.to}
                                className="flex items-center gap-2 px-3 py-2.5 text-sm text-accent hover:bg-surface-hover"
                              >
                                <action.icon className="h-4 w-4" />
                                {action.label}
                              </Link>
                            ) : (
                              <button
                                key={action.label}
                                type="button"
                                onClick={action.onClick}
                                className={`flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-hover ${
                                  action.danger ? 'text-danger' : 'text-text-strong'
                                }`}
                              >
                                <action.icon className="h-4 w-4" />
                                {action.label}
                              </button>
                            ),
                          )}
                        </div>
                      </details>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {editingDescriptionProject && (
        <EditDescriptionDialog
          title={`Resumen de "${editingDescriptionProject.name}"`}
          initialValue={editingDescriptionProject.description ?? ''}
          onSave={handleSaveDescription}
          onCancel={() => setEditingDescriptionProject(null)}
        />
      )}

      {deletingProject && (
        <ConfirmDialog
          title={`Eliminar "${deletingProject.name}"`}
          message="Se eliminará el proyecto junto con sus videos, timeline, subtítulos y shorts. Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          danger
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeletingProject(null)}
        />
      )}
    </div>
  )
}
