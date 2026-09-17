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
import { ChevronRight } from 'lucide-react'

const INDIA_STATES = [
  'Tamil Nadu',
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]

const TN_DISTRICTS = [
  'Coimbatore',
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Cuddalore',
  'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram',
  'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai',
  'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai',
  'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi',
  'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli',
  'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur',
  'Vellore', 'Villupuram', 'Virudhunagar',
]

export default function NavigatorPage() {
  const { mode } = useParams() // "view" | "manage"
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [indiaNode, setIndiaNode] = useState(null)
  const [tnNode, setTnNode] = useState(null)
  const [selectedState, setSelectedState] = useState('Tamil Nadu')
  const [selectedDistrict, setSelectedDistrict] = useState('Coimbatore')

  const [countries, setCountries] = useState([])
  const [states, setStates] = useState([])
  const [districts, setDistricts] = useState([])

  const isView = mode === 'view'
  const modeLabel = isView ? 'View Land Parcels' : 'Update Records'

  useEffect(() => {
    getCountries().then(setCountries).catch(() => {})
  }, [])

  useEffect(() => {
    if (indiaNode) {
      getChildren(indiaNode.id).then(setStates).catch(() => {})
    }
  }, [indiaNode])

  useEffect(() => {
    if (tnNode) {
      getChildren(tnNode.id).then(setDistricts).catch(() => {})
    }
  }, [tnNode])

  async function handleSelectIndia() {
    const node = await getNodeByName('COUNTRY', 'India').catch(() => null)
    setIndiaNode(node)
    setStep(1)
  }

  async function handleSelectTamilNadu() {
    const node = await getNodeByName('STATE', 'Tamil Nadu').catch(() => null)
    setTnNode(node)
    setStep(2)
  }

  async function handleSelectCoimbatore() {
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

  function handleBack() {
    if (step === 2) {
      setStep(1)
      return
    }
    if (step === 1) {
      setStep(0)
      return
    }
    navigate('/')
  }

  const getHeaderCenter = () => {
    if (step === 2) {
      return (
        <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Tamil Nadu › Select District
        </span>
      )
    }

    if (step === 1) {
      return (
        <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          India › Select State
        </span>
      )
    }

    return (
      <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
        {modeLabel} › Select Region
      </span>
    )
  }

  const indiaNodeData = countries.find(c => c.name === 'India')
  const indiaPlotCount = indiaNodeData ? indiaNodeData.plot_count : 0

  const tnNodeData = states.find(s => s.name === 'Tamil Nadu')
  const tnPlotCount = tnNodeData ? tnNodeData.plot_count : 0

  const cbeNodeData = districts.find(d => d.name === 'Coimbatore')
  const cbePlotCount = cbeNodeData ? cbeNodeData.plot_count : 0

  return (
    <div className="home-page-container">
      {/* Background image layer with blur and darkening */}
      <div className="home-bg-layer" />

      {/* Header */}
      <Header onBack={handleBack} centerContent={getHeaderCenter()} />

      {/* Backdrop Overlay Container */}
      <div className="map-backdrop-overlay" style={{ background: 'transparent', flexDirection: 'column', padding: '2rem 1rem', overflowY: 'auto' }}>
        {/* Hero Header Area - Only for Update Records flow */}
        {!isView && (
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
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
              Update Records
            </h1>
            <p className="home-hero-subtitle">
              Administrative Portal to Manage & Update Parcel Database
            </p>
          </div>
        )}

        {step === 0 && (
          <div className="map-selection-card">
            <div className="map-selection-header">
              <div className="map-selection-icon">
                <img src="/world.png" alt="World" />
              </div>
              <h2 className="map-selection-title">Select Region</h2>
              <p className="map-selection-subtitle">
                Choose a region to {isView ? 'explore' : 'manage'} registered land parcels
              </p>
            </div>
            <div className="selection-option-list">
              <button
                className="selection-option-btn"
                onClick={handleSelectIndia}
                autoFocus
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <img src="/india-flag.png" alt="India" className="selection-option-img" />
                  <span style={{ fontWeight: '600' }}>India</span>
                  {indiaPlotCount > 0 && (
                    <span className="badge badge-blue" style={{ fontSize: '0.725rem' }}>
                      {indiaPlotCount} {indiaPlotCount === 1 ? 'parcel' : 'parcels'}
                    </span>
                  )}
                </span>
                <ChevronRight size={18} style={{ color: 'var(--color-primary)' }} />
              </button>
              <button
                className="selection-option-btn"
                style={{ opacity: 0.65, cursor: 'not-allowed' }}
                onClick={() => {}}
                disabled
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <img src="/globe-small.png" alt="Overseas" className="selection-option-img" />
                  <span style={{ fontWeight: '600' }}>Overseas</span>
                  <span className="coming-soon-tag">Coming Soon</span>
                </span>
                <ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="map-selection-card">
            <div className="map-selection-header">
              <div className="map-selection-icon">
                <img src="/india.webp" alt="India" />
              </div>
              <h2 className="map-selection-title">Select State</h2>
              <p className="map-selection-subtitle">India • Choose state to view district boundaries</p>
            </div>
            <div className="selection-dropdown-wrapper">
              <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>State</label>
              <select
                className="selection-select"
                value={selectedState}
                onChange={e => setSelectedState(e.target.value)}
              >
                <option value="Tamil Nadu">Tamil Nadu {tnPlotCount > 0 ? `(${tnPlotCount} parcels)` : ''}</option>
                {INDIA_STATES.filter(s => s !== 'Tamil Nadu').map(s => (
                  <option key={s} value={s} disabled>{s} (Coming Soon)</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }}
              onClick={() => {
                if (selectedState === 'Tamil Nadu') {
                  handleSelectTamilNadu()
                }
              }}
            >
              Continue to State →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="map-selection-card">
            <div className="map-selection-header">
              <div className="map-selection-icon">
                <img src="/tamil-nadu.png" alt="Tamil Nadu" />
              </div>
              <h2 className="map-selection-title">Select District</h2>
              <p className="map-selection-subtitle">
                Tamil Nadu • Choose district to {isView ? 'explore parcel registry' : 'update records'}
              </p>
            </div>
            <div className="selection-dropdown-wrapper">
              <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>District</label>
              <select
                className="selection-select"
                value={selectedDistrict}
                onChange={e => setSelectedDistrict(e.target.value)}
              >
                <option value="Coimbatore">Coimbatore {cbePlotCount > 0 ? `(${cbePlotCount} parcels)` : ''}</option>
                {TN_DISTRICTS.filter(d => d !== 'Coimbatore').map(d => (
                  <option key={d} value={d} disabled>{d} (Coming Soon)</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }}
              onClick={() => {
                if (selectedDistrict === 'Coimbatore') {
                  handleSelectCoimbatore()
                }
              }}
            >
              {isView ? 'Explore District Parcels →' : 'Manage District Records →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

