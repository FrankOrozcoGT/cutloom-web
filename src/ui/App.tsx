import { AuthProvider } from '@ui/auth/AuthContext'
import { AppRouter } from '@ui/router'

function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}

export default App
