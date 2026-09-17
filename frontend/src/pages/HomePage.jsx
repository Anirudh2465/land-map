import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { login, getMe } from '../api/auth'
import Header from '../components/Header'

export default function HomePage() {
  const navigate = useNavigate()
  const { user, setUser, setToken } = useAuth()

  // Inline Login State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email, password)
      setToken(data.access_token)
      const me = await getMe()
      setUser(me)
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="home-page-container">
      {/* Background image layer with blur and darkening */}
      <div className="home-bg-layer" />

      {/* Header */}
      <Header />

      {/* Content Area */}
      <div className="home-content-wrapper">
        <div style={{ textAlign: 'center', marginBottom: '2.25rem' }}>
          <img
            src="/logo.png"
            alt="LMS Logo"
            style={{
              height: '84px',
              width: 'auto',
              marginBottom: '0.85rem',
              filter: 'brightness(0) invert(1) drop-shadow(0 2px 10px rgba(0, 0, 0, 0.5))',
            }}
          />
          <h1 className="home-hero-title">
            Land Management System
          </h1>
          <p className="home-hero-subtitle">
            Spatial Parcel Registry & GIS Analytics Portal
          </p>
        </div>

        {!user ? (
          /* Mandatory Login Card */
          <div className="glass-login-card">
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <span className="glass-card-badge">Portal Authentication</span>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '700', marginBottom: '0.4rem', color: '#0f172a' }}>
                Sign In to LMS
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                Enter your credentials to access your account.
              </p>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="glass-input-label" htmlFor="email">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  className="form-input glass-input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@lms.com"
                  required
                  autoFocus
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="glass-input-label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="form-input glass-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                id="btn-login-submit"
                type="submit"
                className="glass-btn-primary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : 'Sign In'}
              </button>
            </form>
          </div>
        ) : (
          /* Logged In Light Theme Action Cards */
          <div className="action-card-grid">
            {/* View Land Parcels */}
            <div
              id="btn-view-parcels"
              className="glass-action-card card-view"
              onClick={() => navigate('/map')}
            >
              <div className="action-card-header-row">
                <div className="action-card-icon-wrapper">🗺️</div>
              </div>
              <h2 className="action-card-title">
                View Land Parcels
              </h2>
              <p className="action-card-desc">
                Explore GIS boundaries, high-resolution satellite imagery, and underlying legal documents.
              </p>
              <div className="action-card-footer">
                <span>Access Interactive Map</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>
            </div>

            {/* Update Records */}
            <div
              id="btn-update-records"
              className="glass-action-card card-update"
              onClick={() => navigate('/navigate/manage')}
            >
              <div className="action-card-header-row">
                <div className="action-card-icon-wrapper">📋</div>
              </div>
              <h2 className="action-card-title">
                Update Records
              </h2>
              <p className="action-card-desc">
                Administrative portal to manage parcel records, upload KML geometries, and attach FMB/Patta/Deed files.
              </p>
              <div className="action-card-footer">
                <span>Manage Parcel Database</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
