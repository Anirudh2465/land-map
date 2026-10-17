import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import NavigatorPage from './pages/NavigatorPage'
import MapPage from './pages/MapPage'
import ManagePage from './pages/ManagePage'
import ServerWarmupOverlay from './components/ServerWarmupOverlay'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Public map view */}
      <Route path="/map/*" element={<MapPage />} />

      {/* Admin manage route — protected */}
      <Route
        path="/manage/*"
        element={
          <ProtectedRoute>
            <ManagePage />
          </ProtectedRoute>
        }
      />

      {/* Backward compat for /navigate/:mode */}
      <Route path="/navigate/view" element={<Navigate to="/map" replace />} />
      <Route path="/navigate/manage" element={<Navigate to="/manage" replace />} />
      <Route path="/navigate/:mode" element={<Navigate to="/manage" replace />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ServerWarmupOverlay>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ServerWarmupOverlay>
  )
}
