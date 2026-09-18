import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import NavigatorPage from './pages/NavigatorPage'
import MapPage from './pages/MapPage'
import ManagePage from './pages/ManagePage'

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

      {/* Navigation drill-down: view or manage */}
      <Route path="/navigate/:mode" element={<NavigatorPage />} />

      {/* Public map view */}
      <Route path="/map" element={<MapPage />} />
      <Route path="/map/:districtId" element={<MapPage />} />

      {/* Admin manage route — protected */}
      <Route
        path="/manage/:districtId"
        element={
          <ProtectedRoute>
            <ManagePage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
