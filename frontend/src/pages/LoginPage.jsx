import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { login, getMe } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, setUser, setToken } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const next = searchParams.get('next') || '/'

  // Auto-redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate(next, { replace: true })
    }
  }, [user, navigate, next])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email, password)
      setToken(data.access_token)
      const me = await getMe()
      setUser(me)
      navigate(next, { replace: true })
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

          <form onSubmit={handleSubmit}>
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
      </div>
    </div>
  )
}

