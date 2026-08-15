import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SidebarProvider } from './SidebarContext'
import { TopBar } from './TopBar'
import { useSidebar } from './useSidebar'

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
        <main className={`min-h-0 flex-1 overflow-y-auto ${isOpen ? 'md:ml-56' : 'md:ml-16'}`}>
          <Outlet />
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
