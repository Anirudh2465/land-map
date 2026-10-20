/**
 * NavigatorPage — shared drill-down navigator for both "view" and "manage" modes.
 * Route: /navigate/:mode  (mode = "view" | "manage")
 *
 * Flow: 
 *   India → States → Districts → Taluks → Map/Manage
 *   Overseas → Countries → Map/Manage
 */
import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCountries, getChildren, createVillage } from '../api/geo'
import Header from '../components/Header'
import { ChevronRight, Plus, X } from 'lucide-react'

export default function NavigatorPage() {
  const { mode } = useParams() // "view" | "manage"
  const navigate = useNavigate()

  const [step, setStep] = useState(0) // 0: Region, 1: India State, 2: India District, 3: India Taluk, 10: Overseas Country
  
  const [countries, setCountries] = useState([])
  const [states, setStates] = useState([])
  const [districts, setDistricts] = useState([])
  const [taluks, setTaluks] = useState([])
  const [villages, setVillages] = useState([])

  const [selectedOverseasId, setSelectedOverseasId] = useState('')
  const [selectedStateId, setSelectedStateId] = useState('')
  const [selectedDistrictId, setSelectedDistrictId] = useState('')
  const [selectedTalukId, setSelectedTalukId] = useState('')
  const [selectedVillageId, setSelectedVillageId] = useState('')
  
  const [loadingRegions, setLoadingRegions] = useState(false)

  // Add Village Modal States
  const [showAddVillage, setShowAddVillage] = useState(false)
  const [newVillageName, setNewVillageName] = useState('')
  const [addVillageError, setAddVillageError] = useState('')
  const [addVillageLoading, setAddVillageLoading] = useState(false)

  const isView = mode === 'view'
  const modeLabel = isView ? 'View Land Parcels' : 'Update Records'

  useEffect(() => {
    getCountries().then(data => {
      setCountries(data)
    }).catch(() => {})
  }, [])

  const indiaNode = countries.find(c => c.name === 'India')
  const overseasNodes = countries.filter(c => c.name !== 'India')

  // Display nodes with Tamil Nadu and Coimbatore prioritized as 1st choices
  const displayStates = useMemo(() => {
    return [...states].sort((a, b) => {
      if (a.name === 'Tamil Nadu') return -1
      if (b.name === 'Tamil Nadu') return 1
      return a.name.localeCompare(b.name)
    })
  }, [states])

  const displayDistricts = useMemo(() => {
    return [...districts].sort((a, b) => {
      if (a.name === 'Coimbatore') return -1
      if (b.name === 'Coimbatore') return 1
      return a.name.localeCompare(b.name)
    })
  }, [districts])

  const displayTaluks = taluks
  const displayOverseas = overseasNodes

  // Fetch states when India is selected — default automatically to Tamil Nadu
  async function handleSelectIndia() {
    if (!indiaNode) return
    setLoadingRegions(true)
    try {
      const st = await getChildren(indiaNode.id)
      const sorted = [...st].sort((a, b) => {
        if (a.name === 'Tamil Nadu') return -1
        if (b.name === 'Tamil Nadu') return 1
        return a.name.localeCompare(b.name)
      })
      setStates(sorted)
      const tn = sorted.find(s => s.name === 'Tamil Nadu') || sorted[0]
      if (tn) setSelectedStateId(tn.id)
      setStep(1)
    } finally {
      setLoadingRegions(false)
    }
  }

  // Fetch districts when State is confirmed — default automatically to Coimbatore
  async function handleStateContinue() {
    if (!selectedStateId) return
    setLoadingRegions(true)
    try {
      const dt = await getChildren(selectedStateId)
      const sorted = [...dt].sort((a, b) => {
        if (a.name === 'Coimbatore') return -1
        if (b.name === 'Coimbatore') return 1
        return a.name.localeCompare(b.name)
      })
      setDistricts(sorted)
      const cbe = sorted.find(d => d.name === 'Coimbatore') || sorted[0]
      if (cbe) setSelectedDistrictId(cbe.id)
      setStep(2)
    } finally {
      setLoadingRegions(false)
    }
  }

  // Fetch taluks when District is confirmed
  async function handleDistrictContinue() {
    if (!selectedDistrictId) return
    setLoadingRegions(true)
    try {
      const tl = await getChildren(selectedDistrictId)
      setTaluks(tl)
      if (tl.length > 0) setSelectedTalukId(tl[0].id)
      setStep(3)
    } finally {
      setLoadingRegions(false)
    }
  }

  // Fetch villages when Taluk is confirmed (both View and Manage modes proceed to Step 4)
  async function handleTalukContinue() {
    if (!selectedTalukId) return
    setLoadingRegions(true)
    try {
      const vl = await getChildren(selectedTalukId)
      setVillages(vl)
      if (vl.length > 0) setSelectedVillageId(vl[0].id)
      else setSelectedVillageId('')
      setStep(4)
    } finally {
      setLoadingRegions(false)
    }
  }

  async function handleAddVillage() {
    if (!newVillageName.trim() || !selectedTalukId) return
    setAddVillageLoading(true)
    setAddVillageError('')
    try {
      const village = await createVillage(selectedTalukId, newVillageName.trim())
      setVillages(prev => [...prev, village].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedVillageId(village.id)
      setNewVillageName('')
      setShowAddVillage(false)
    } catch (err) {
      setAddVillageError(err.response?.data?.detail || 'Failed to create town / village.')
    } finally {
      setAddVillageLoading(false)
    }
  }

  function handleSelectOverseasBtn() {
    if (displayOverseas.length > 0) {
      setSelectedOverseasId(displayOverseas[0].id)
    }
    setStep(10)
  }

  function handleNavigate(nodeId) {
    if (!nodeId) return
    if (isView) {
      navigate(`/map/${nodeId}`)
    } else {
      navigate(`/manage/${nodeId}`)
    }
  }

  function handleBack() {
    if (step === 4) { setStep(3); return }
    if (step === 3) { setStep(2); return }
    if (step === 2) { setStep(1); return }
    if (step === 1 || step === 10) { setStep(0); return }
    navigate('/')
  }

  const getHeaderCenter = () => {
    let text = `${modeLabel} › Select Region`
    if (step === 1) text = 'India › Select State'
    if (step === 2) {
      const stName = states.find(s => s.id === selectedStateId)?.name || 'State'
      text = `${stName} › Select District`
    }
    if (step === 3) {
      const stName = states.find(s => s.id === selectedStateId)?.name || 'State'
      const distName = districts.find(d => d.id === selectedDistrictId)?.name || 'District'
      text = `${stName} › ${distName} › Select Taluk`
    }
    if (step === 4) {
      const distName = districts.find(d => d.id === selectedDistrictId)?.name || 'District'
      const talukName = taluks.find(t => t.id === selectedTalukId)?.name || 'Taluk'
      text = `${distName} › ${talukName} › Select Town / Village`
    }
    if (step === 10) text = 'Overseas › Select Country'
    return <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{text}</span>
  }

  return (
    <div className="home-page-container">
      <div className="home-bg-layer" />
      <Header onBack={handleBack} centerContent={getHeaderCenter()} />

      <div className="map-backdrop-overlay" style={{ background: 'transparent', flexDirection: 'column', padding: '2rem 1rem', overflowY: 'auto' }}>
        {!isView && (
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <img src="/logo.png" alt="LMS Logo" style={{ height: '84px', width: 'auto', marginBottom: '0.85rem', filter: 'brightness(0) invert(1) drop-shadow(0 2px 10px rgba(0, 0, 0, 0.5))' }} />
            <h1 className="home-hero-title">Update Records</h1>
            <p className="home-hero-subtitle">Administrative Portal to Manage &amp; Update Parcel Database</p>
          </div>
        )}

        {step === 0 && (
          <div className="map-selection-card">
            <div className="map-selection-header">
              <div className="map-selection-icon"><img src="/world.png" alt="World" /></div>
              <h2 className="map-selection-title">Select Region</h2>
              <p className="map-selection-subtitle">Choose a region to {isView ? 'explore' : 'manage'} registered land parcels</p>
            </div>
            <div className="selection-option-list">
              <button className="selection-option-btn" onClick={handleSelectIndia} autoFocus disabled={!indiaNode}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <img src="/india-flag.png" alt="India" className="selection-option-img" />
                  <span style={{ fontWeight: '600' }}>India</span>
                </span>
                <ChevronRight size={18} style={{ color: 'var(--color-primary)' }} />
              </button>
              
              <button className="selection-option-btn" onClick={handleSelectOverseasBtn} disabled={displayOverseas.length === 0}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <img src="/globe-small.png" alt="Overseas" className="selection-option-img" />
                  <span style={{ fontWeight: '600' }}>Overseas</span>
                </span>
                <ChevronRight size={18} style={{ color: 'var(--color-primary)' }} />
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="map-selection-card">
            <div className="map-selection-header">
              <div className="map-selection-icon"><img src="/india.png" alt="India" /></div>
              <h2 className="map-selection-title">Select State</h2>
              <p className="map-selection-subtitle">India • Choose state to view district boundaries</p>
            </div>
            <div className="selection-dropdown-wrapper">
              <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>State</label>
              {displayStates.length === 0 ? (
                 <p style={{ color: 'var(--color-text-muted)' }}>No states available.</p>
              ) : (
                <select className="selection-select" value={selectedStateId} onChange={e => setSelectedStateId(e.target.value)}>
                  {displayStates.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }} onClick={handleStateContinue} disabled={!selectedStateId || loadingRegions}>
              {loadingRegions ? 'Loading...' : 'Continue to District →'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="map-selection-card">
            <div className="map-selection-header">
              <div className="map-selection-icon"><img src="/tamil-nadu.png" alt="District" /></div>
              <h2 className="map-selection-title">Select District</h2>
              <p className="map-selection-subtitle">Choose district to view its taluks</p>
            </div>
            <div className="selection-dropdown-wrapper">
              <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>District</label>
              {displayDistricts.length === 0 ? (
                 <p style={{ color: 'var(--color-text-muted)' }}>No districts available.</p>
              ) : (
                <select className="selection-select" value={selectedDistrictId} onChange={e => setSelectedDistrictId(e.target.value)}>
                  {displayDistricts.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }} onClick={handleDistrictContinue} disabled={!selectedDistrictId || loadingRegions}>
              {loadingRegions ? 'Loading...' : 'Continue to Taluk →'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="map-selection-card">
            <div className="map-selection-header">
              <div className="map-selection-icon"><img src="/tamil-nadu.png" alt="Taluk" /></div>
              <h2 className="map-selection-title">Select Taluk</h2>
              <p className="map-selection-subtitle">
                {districts.find(d => d.id === selectedDistrictId)?.name || 'District'} • Choose taluk to {isView ? 'view towns / villages' : 'manage records'}
              </p>
            </div>
            <div className="selection-dropdown-wrapper">
              <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>Taluk</label>
              {displayTaluks.length === 0 ? (
                 <p style={{ color: 'var(--color-text-muted)' }}>No taluks available.</p>
              ) : (
                <select className="selection-select" value={selectedTalukId} onChange={e => setSelectedTalukId(e.target.value)}>
                  {displayTaluks.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }} onClick={handleTalukContinue} disabled={!selectedTalukId || displayTaluks.length === 0 || loadingRegions}>
              {loadingRegions ? 'Loading...' : 'Continue to Town / Village →'}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="map-selection-card">
            <div className="map-selection-header">
              <div className="map-selection-icon"><img src="/tamil-nadu.png" alt="Town / Village" /></div>
              <h2 className="map-selection-title">Select Town / Village</h2>
              <p className="map-selection-subtitle">
                {taluks.find(t => t.id === selectedTalukId)?.name || 'Taluk'} • Choose town / village to {isView ? 'explore parcel registry' : 'manage records'}
              </p>
            </div>
            <div className="selection-dropdown-wrapper">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ margin: 0, fontWeight: '600' }}>Town / Village</label>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderRadius: '6px' }}
                  onClick={() => { setShowAddVillage(true); setAddVillageError(''); setNewVillageName('') }}
                >
                  <Plus size={13} /> Add Town / Village
                </button>
              </div>
              {villages.length === 0 ? (
                 <p style={{ color: 'var(--color-text-muted)' }}>No towns / villages available in this taluk.</p>
              ) : (
                <select className="selection-select" value={selectedVillageId} onChange={e => setSelectedVillageId(e.target.value)}>
                  {villages.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              )}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }} onClick={() => handleNavigate(selectedVillageId)} disabled={!selectedVillageId || villages.length === 0}>
              {isView ? 'Explore Town / Village Parcels →' : 'Manage Town / Village Records →'}
            </button>
          </div>
        )}

        {step === 10 && (
          <div className="map-selection-card">
            <div className="map-selection-header">
              <div className="map-selection-icon"><img src="/world.png" alt="Overseas" /></div>
              <h2 className="map-selection-title">Select Country</h2>
              <p className="map-selection-subtitle">Choose overseas country to {isView ? 'explore parcel registry' : 'update records'}</p>
            </div>
            <div className="selection-dropdown-wrapper">
              <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>Country</label>
              {displayOverseas.length === 0 ? (
                 <p style={{ color: 'var(--color-text-muted)' }}>No countries available.</p>
              ) : (
                <select className="selection-select" value={selectedOverseasId} onChange={e => setSelectedOverseasId(e.target.value)}>
                  {displayOverseas.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }} onClick={() => handleNavigate(selectedOverseasId)} disabled={!selectedOverseasId}>
              {isView ? 'Explore Country Parcels →' : 'Manage Country Records →'}
            </button>
          </div>
        )}
      </div>

      {/* Add Village Modal */}
      {showAddVillage && (
        <div className="modal-overlay" onClick={() => setShowAddVillage(false)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Town / Village</span>
              <button className="btn-outline" style={{ border: 'none', padding: '0.2rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowAddVillage(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {addVillageError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{addVillageError}</div>}
              <div className="form-group">
                <label className="form-label">Town / Village Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Bogampatti"
                  value={newVillageName}
                  onChange={e => setNewVillageName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddVillage() }}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowAddVillage(false)} disabled={addVillageLoading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddVillage} disabled={!newVillageName.trim() || addVillageLoading}>
                {addVillageLoading ? 'Creating...' : 'Create Town / Village'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
