import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SidebarProvider } from './SidebarContext'
import { TopBar } from './TopBar'

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-svh flex-col bg-bg">
        <TopBar />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
