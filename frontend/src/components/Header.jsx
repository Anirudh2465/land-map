import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <header className="header">
      <Link to="/" className="header-logo">
        LMS <span>Land Management System</span>
      </Link>
      <div className="header-right">
        {user ? (
          <>
            <span className="header-user">
              {user.full_name} <span style={{ color: '#94a3b8' }}>({user.role})</span>
            </span>
            <button className="btn btn-outline btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary btn-sm">
            Login
          </Link>
        )}
      </div>
    </header>
  )
}
