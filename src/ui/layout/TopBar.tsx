import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Project } from '@domain/project'
import { useAuth } from '@ui/auth/useAuth'
import { LogoutButton } from '@ui/components/LogoutButton'
import { projectUseCase } from '@ui/video/composition'
import { useSidebar } from './useSidebar'

export function TopBar() {
  const { isAuthenticated, user } = useAuth()
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { isOpen, toggle } = useSidebar()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    void projectUseCase.getAll().then(setProjects)
  }, [])

  const handleSelectProject = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextId = event.target.value
      if (nextId) {
        navigate(`/projects/${nextId}`)
      }
    },
    [navigate],
  )

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3 md:px-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label={isOpen ? 'Colapsar menú' : 'Expandir menú'}
          title={isOpen ? 'Colapsar menú' : 'Expandir menú'}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-strong"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
        <Link to="/" className="text-sm font-semibold text-text-strong">
          CutLoom
        </Link>
        {projectId && projects.length > 0 && (
          <select
            value={projectId}
            onChange={handleSelectProject}
            className="rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text-strong outline-none focus:border-accent-border focus:ring-2 focus:ring-accent-bg"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isAuthenticated ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-strong">{user?.name ?? user?.email}</span>
          <LogoutButton />
        </div>
      ) : (
        <Link
          to="/login"
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-strong transition-colors hover:bg-surface-hover"
        >
          Iniciar sesión
        </Link>
      )}
    </header>
  )
}
