import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Header({ onBack, showBack, centerContent }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleLogout() {
    setDropdownOpen(false)
    logout()
    navigate('/')
  }

  function handleBackClick() {
    if (onBack) {
      onBack()
    } else {
      navigate(-1)
    }
  }

  // Get user initials for avatar
  const getInitials = (name) => {
    if (!name) return 'U'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  const hasBack = Boolean(onBack || showBack)

  return (
    <header className="header">
      {/* Left side: Back button + Logo + Title */}
      <div className="header-left">
        {hasBack && (
          <button
            className="header-back-btn"
            onClick={handleBackClick}
            title="Go Back"
            aria-label="Go Back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
        )}

        <Link to="/" className="header-logo-link">
          <img src="/logo.png" alt="LMW Logo" className="header-logo-img" />
          <div className="header-brand-title">
            LMW <span className="brand-sub">— Land Management System (LMS)</span>
          </div>
        </Link>
      </div>

      {/* Center: Integrated region & parcel summary info */}
      <div className="header-center">
        {centerContent}
      </div>

      {/* Right side: User Display (Name (Role) + Profile Picture with Dropdown) */}
      <div className="header-right" ref={dropdownRef}>
        {user ? (
          <>
            <div className="header-user-badge">
              <span className="header-user-name">{user.full_name}</span>
              <span className="header-role-pill">{user.role}</span>
            </div>

            {/* Profile Avatar Button */}
            <button
              className="header-avatar-btn"
              onClick={() => setDropdownOpen(prev => !prev)}
              aria-label="User profile menu"
              title={`${user.full_name} (${user.role})`}
            >
              <img src="/profile.png" alt={user.full_name} className="header-avatar-img" />
            </button>

            {/* Profile Dropdown Menu */}
            {dropdownOpen && (
              <div className="user-dropdown-menu">
                <div className="user-dropdown-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <img
                    src="/profile.png"
                    alt={user.full_name}
                    style={{ width: '68px', height: '68px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #e2e8f0' }}
                  />
                  <div>
                    <div className="user-dropdown-name">{user.full_name}</div>
                    <div className="user-dropdown-email">{user.email}</div>
                    <div style={{ marginTop: '2px' }}>
                      <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
                        {user.role}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  className="user-dropdown-item danger"
                  onClick={handleLogout}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span>Logout</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <Link to="/login" className="btn btn-primary btn-sm">
            Sign In
          </Link>
        )}
      </div>
    </header>
  )
}

