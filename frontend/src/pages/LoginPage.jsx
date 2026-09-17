import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { login } from '../api/auth'
import { getMe } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setUser, setToken } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email, password)
      setToken(data.access_token)
      // Fetch user details
      const me = await getMe()
      setUser(me)
      const next = searchParams.get('next') || '/'
      navigate(next)
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="home-page-container">
      <div className="home-bg-layer" />
      <Header />
      <div className="home-content-wrapper">
        <div className="glass-login-card">
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <span className="glass-card-badge">Portal Authentication</span>
            <h1 style={{ fontSize: '1.4rem', fontWeight: '700', marginBottom: '0.4rem', color: '#0f172a' }}>
              Sign In to LMS
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
              Enter your credentials to access your account.
            </p>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="glass-input-label" htmlFor="email">Email Address</label>
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
              <label className="glass-input-label" htmlFor="password">Password</label>
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
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
            <Link to="/" style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '500' }}>
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
