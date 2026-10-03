import { AuthProvider } from '@ui/auth/AuthContext'
import { NotificationsProvider } from '@ui/notifications/NotificationsContext'
import { ToastProvider } from '@ui/toasts/ToastProvider'
import { AppRouter } from '@ui/router'

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <NotificationsProvider>
          <AppRouter />
        </NotificationsProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
