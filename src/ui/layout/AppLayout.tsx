import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SidebarProvider } from './SidebarContext'
import { TopBar } from './TopBar'
import { useSidebar } from './useSidebar'

function AppLayoutContent() {
  const { isOpen } = useSidebar()

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <TopBar />
      <div className="flex flex-1">
        <Sidebar />
        <main
          className={`flex-1 overflow-auto transition-[margin] ${isOpen ? 'md:ml-56' : 'md:ml-16'}`}
        >
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
