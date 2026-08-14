import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SidebarProvider } from './SidebarContext'
import { TopBar } from './TopBar'

/**
 * Grid de 2x2: la topbar ocupa toda la fila superior, el sidebar toda la
 * columna izquierda debajo de ella. Al ser celdas de grid (no fixed/sticky
 * superpuestos), no compiten entre sí por espacio ni z-index — el ancho del
 * sidebar solo se define una vez, en su propia celda (ver Sidebar.tsx).
 *
 * En mobile el sidebar es fixed (overlay, fuera del flujo), pero grid-cols
 * con "auto" igual reserva espacio para su contenido — se ve como un hueco
 * en blanco a la izquierda. La columna vale 0 en mobile y solo pasa a "auto"
 * desde md:, que es donde el sidebar vuelve a ser una celda real del grid.
 */
export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="grid min-h-svh grid-cols-[0_1fr] grid-rows-[auto_1fr] bg-bg md:grid-cols-[auto_1fr]">
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
