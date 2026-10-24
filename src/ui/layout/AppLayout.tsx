import { Link, Outlet } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { YouTubeIcon } from '@ui/icons/YouTubeIcon'
import { LinkedInIcon } from '@ui/icons/LinkedInIcon'
import { Sidebar } from './Sidebar'
import { SidebarProvider } from './SidebarContext'
import { TopBar } from './TopBar'
import { useSidebar } from './useSidebar'

function AppFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-4 border-t border-border px-4 py-3 text-xs text-text-muted">
      <Link to="/legal/terms" className="hover:text-text-strong hover:underline">
        Términos de Servicio
      </Link>
      <Link to="/legal/privacy" className="hover:text-text-strong hover:underline">
        Política de Privacidad
      </Link>
      <a href="mailto:frank.orozco.11.87@gmail.com" className="flex items-center gap-1 hover:text-text-strong">
        <Mail className="h-3.5 w-3.5" />
        Contacto
      </a>
      <a
        href="https://www.youtube.com/@neuroForgeLab"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 hover:text-text-strong"
      >
        <YouTubeIcon className="h-3.5 w-3.5" />
        YouTube
      </a>
      <a
        href="https://www.linkedin.com/in/frankorozco1187/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 hover:text-text-strong"
      >
        <LinkedInIcon className="h-3.5 w-3.5" />
        LinkedIn
      </a>
    </footer>
  )
}

/**
 * El sidebar nunca es hijo de un grid/flex de layout — siempre se posiciona
 * a sí mismo con fixed (overlay sobre todo en mobile, anclado bajo la
 * topbar en desktop) y no reserva espacio en el flujo del documento. Eso
 * evita que su ausencia visual en un breakpoint deje huecos o celdas
 * vacías en el layout — un solo <nav>, sin duplicar el componente.
 *
 * <main> compensa el ancho del sidebar únicamente en desktop, con su
 * propio margin-left (el único lugar donde se define ese ancho).
 */
function AppLayoutContent() {
  const { isOpen } = useSidebar()

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-bg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className={`flex min-h-0 flex-1 flex-col ${isOpen ? 'md:ml-56' : 'md:ml-16'}`}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
          <AppFooter />
        </main>
      </div>
    </div>
  )
}

export function AppLayout() {
  return (
    <SidebarProvider>
      <AppLayoutContent />
    </SidebarProvider>
  )
}
