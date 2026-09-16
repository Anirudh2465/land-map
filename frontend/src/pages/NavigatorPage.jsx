/**
 * NavigatorPage — shared drill-down navigator for both "view" and "manage" modes.
 * Route: /navigate/:mode  (mode = "view" | "manage")
 *
 * Flow: India/Overseas → States → Districts → Map or ManagePage
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCountries, getChildren, getNodeByName } from '../api/geo'
import Header from '../components/Header'

const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]

const TN_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore',
  'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram',
  'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai',
  'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai',
  'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi',
  'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli',
  'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur',
  'Vellore', 'Villupuram', 'Virudhunagar',
]

// Which items are functional in MVP
const ACTIVE_STATES = new Set(['Tamil Nadu'])
const ACTIVE_DISTRICTS = new Set(['Coimbatore'])

function GridButton({ label, active, onClick, disabled }) {
  return (
    <button
      onClick={active && !disabled ? onClick : undefined}
      style={{
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--color-border)',
        background: active ? 'var(--color-surface)' : '#f8fafc',
        color: active ? 'var(--color-text)' : 'var(--color-disabled)',
        cursor: active ? 'pointer' : 'default',
        fontSize: '0.9rem',
        fontWeight: active ? '500' : '400',
        textAlign: 'left',
        transition: 'background 0.12s, border-color 0.12s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
      onMouseEnter={e => {
        if (active) {
          e.currentTarget.style.borderColor = 'var(--color-primary)'
          e.currentTarget.style.background = 'var(--color-primary-light)'
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.background = active ? 'var(--color-surface)' : '#f8fafc'
      }}
    >
      {label}
      {!active && <span className="coming-soon-tag">Coming Soon</span>}
    </button>
  )
}

export default function NavigatorPage() {
  const { mode } = useParams() // "view" | "manage"
  const navigate = useNavigate()

  // Steps: 0=country, 1=state, 2=district
  const [step, setStep] = useState(0)
  const [indiaNode, setIndiaNode] = useState(null)
  const [tnNode, setTnNode] = useState(null)
  const [selectedCountry, setSelectedCountry] = useState(null)

  const isView = mode === 'view'
  const modeLabel = isView ? 'View Land Parcels' : 'Update Records'

  async function handleSelectIndia() {
    // Fetch India GeoNode
    const node = await getNodeByName('COUNTRY', 'India').catch(() => null)
    setIndiaNode(node)
    setSelectedCountry('India')
    setStep(1)
  }

  async function handleSelectTamilNadu() {
    const node = await getNodeByName('STATE', 'Tamil Nadu').catch(() => null)
    setTnNode(node)
    setStep(2)
  }

  async function handleSelectCoimbatore() {
    // Fetch Coimbatore node ID, then navigate
    const node = await getNodeByName('DISTRICT', 'Coimbatore').catch(() => null)
    if (!node) {
      alert('Coimbatore district not found in database. Please ensure seeding ran correctly.')
      return
    }
    if (isView) {
      navigate(`/map/${node.id}`)
    } else {
      navigate(`/manage/${node.id}`)
    }
  }

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: modeLabel, href: null },
    step >= 1 && { label: 'India', href: null, onClick: () => setStep(1) },
    step >= 2 && { label: 'Tamil Nadu', href: null, onClick: () => setStep(2) },
  ].filter(Boolean)

  return (
    <div className="page-container">
      <Header />
      <div className="content-wrapper">
        {/* Breadcrumb */}
        <nav className="breadcrumb" aria-label="breadcrumb">
          {breadcrumbItems.map((item, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {i > 0 && <span className="breadcrumb-sep">›</span>}
              {item.onClick ? (
                <button onClick={item.onClick}>{item.label}</button>
              ) : item.href ? (
                <a href={item.href}>{item.label}</a>
              ) : (
                <span style={{ color: 'var(--color-text)' }}>{item.label}</span>
              )}
            </span>
          ))}
        </nav>

        {/* Step 0: India / Overseas */}
        {step === 0 && (
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: '600', marginBottom: '1.5rem' }}>
              Select Region
            </h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', maxWidth: '500px' }}>
              <GridButton
                label="🇮🇳  India"
                active={true}
                onClick={handleSelectIndia}
              />
              <GridButton
                label="🌐  Overseas"
                active={false}
              />
            </div>
          </div>
        )}

        {/* Step 1: States */}
        {step === 1 && (
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: '600', marginBottom: '1.5rem' }}>
              Select State — India
            </h1>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '0.75rem',
            }}>
              {INDIA_STATES.map(state => (
                <GridButton
                  key={state}
                  label={state}
                  active={ACTIVE_STATES.has(state)}
                  onClick={state === 'Tamil Nadu' ? handleSelectTamilNadu : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Districts */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: '600', marginBottom: '1.5rem' }}>
              Select District — Tamil Nadu
            </h1>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '0.75rem',
            }}>
              {TN_DISTRICTS.map(district => (
                <GridButton
                  key={district}
                  label={district}
                  active={ACTIVE_DISTRICTS.has(district)}
                  onClick={district === 'Coimbatore' ? handleSelectCoimbatore : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
