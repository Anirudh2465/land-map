import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  function handleUpdateRecords() {
    if (!user) {
      navigate('/login?next=/navigate/manage')
    } else {
      navigate('/navigate/manage')
    }
  }

  return (
    <div className="page-container">
      <Header />
      <div className="content-wrapper">
        <div style={{ textAlign: 'center', marginBottom: '2.5rem', marginTop: '1rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
            Land Management System
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '1rem' }}>
            Land Parcel Registry (Testing Build)
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem',
          maxWidth: '700px',
          margin: '0 auto',
        }}>
          {/* View Land Parcels */}
          <button
            id="btn-view-parcels"
            onClick={() => navigate('/navigate/view')}
            className="card"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              border: '2px solid transparent',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--color-primary)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'transparent'
              e.currentTarget.style.boxShadow = 'var(--shadow)'
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🗺️</div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              View Land Parcels
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Browse and explore land parcels on an interactive satellite map.
              View parcel boundaries, details, and documents.
            </p>
          </button>

          {/* Update Records */}
          <button
            id="btn-update-records"
            onClick={handleUpdateRecords}
            className="card"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              border: '2px solid transparent',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--color-primary)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'transparent'
              e.currentTarget.style.boxShadow = 'var(--shadow)'
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>
              {user ? '📋' : '🔒'}
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Update Records
              {!user && (
                <span style={{
                  fontSize: '0.75rem',
                  marginLeft: '0.5rem',
                  color: 'var(--color-text-muted)',
                  fontWeight: 400,
                }}>
                  (Login required)
                </span>
              )}
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Admin portal to add, edit, and manage land parcel records,
              KML boundaries, and supporting documents.
            </p>
          </button>
        </div>
      </div>
    </div>
  )
}
