import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SidebarProvider } from './SidebarContext'
import { TopBar } from './TopBar'

/**
 * Grid de 2x2: la topbar ocupa toda la fila superior, el sidebar toda la
 * columna izquierda debajo de ella. Al ser celdas de grid (no fixed/sticky
 * superpuestos), no compiten entre sí por espacio ni z-index — el ancho del
 * sidebar solo se define una vez, en su propia celda (ver Sidebar.tsx).
 */
export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="grid min-h-svh grid-cols-[auto_1fr] grid-rows-[auto_1fr] bg-bg">
        <div className="col-span-2">
          <TopBar />
        </div>
        <Sidebar />
        <main className="overflow-auto">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  )
}
