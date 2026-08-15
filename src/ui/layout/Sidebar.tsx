import { NavLink, useParams } from 'react-router-dom'
import { useSidebar } from './useSidebar'

interface NavItem {
  to: string
  label: string
  end?: boolean
  icon: React.ReactNode
}

const ProjectsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

const ProfileIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
  </svg>
)

const EditorIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18" />
  </svg>
)

const BackIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// py-3 en vez de py-2: en mobile el target táctil de cada link debe rondar
// los 44px de alto (guía de accesibilidad táctil), no solo verse "cómodo" en desktop.
function linkClasses({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ${
    isActive ? 'bg-accent-bg text-accent' : 'text-text-muted hover:bg-surface-hover hover:text-text-strong'
  }`
}

// Breakpoint md de Tailwind (768px): por debajo, el sidebar es un overlay que
// debe cerrarse solo al navegar; por encima, es una columna fija que el
// usuario controla explícitamente con el botón de la topbar.
const MOBILE_QUERY = '(max-width: 767px)'

export function Sidebar() {
  const { projectId } = useParams<{ projectId: string }>()
  const { isOpen, toggle } = useSidebar()

  const items: NavItem[] = projectId
    ? [
        { to: '/', label: 'Mis proyectos', end: true, icon: BackIcon },
        { to: `/projects/${projectId}`, label: 'Editor', end: true, icon: EditorIcon },
      ]
    : [
        { to: '/', label: 'Mis proyectos', end: true, icon: ProjectsIcon },
        { to: '/profile', label: 'Perfil', icon: ProfileIcon },
      ]

  function handleNavigate() {
    if (isOpen && window.matchMedia(MOBILE_QUERY).matches) {
      toggle()
    }
  }

  return (
    <>
      {/* Overlay: solo existe en mobile, donde el sidebar flota sobre el contenido. */}
      {isOpen && (
        <div onClick={toggle} className="fixed inset-0 z-20 bg-black/40 md:hidden" aria-hidden="true" />
      )}

      <nav
        className={`fixed inset-y-0 left-0 z-30 w-64 -translate-x-full border-r border-border bg-surface p-3 transition-transform md:top-16 md:w-56 md:translate-x-0 md:transition-[width] ${
          isOpen ? 'translate-x-0 md:w-56' : 'md:w-16'
        } flex flex-col gap-1`}
      >
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={handleNavigate}
            className={linkClasses}
            title={item.label}
          >
            {item.icon}
            <span className={isOpen ? 'inline' : 'inline md:hidden'}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
