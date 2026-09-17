/**
 * ManagePage — Admin portal for managing land parcels in a district.
 * Route: /manage/:districtId
 *
 * Features:
 *  - List all parcels in the district
 *  - Add New Parcel form (modal) with KML + 3 PDF uploads
 *  - Delete parcel (soft-delete)
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getPlots, createPlot, deletePlot, extractKml } from '../api/plots'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import { Map, Info, FileText, Upload, Check, X, Pencil, RefreshCw } from 'lucide-react'

const AREA_UNITS = ['sqm', 'sqft', 'acres', 'hectares']

const UNIT_CONVERSION = {
  sqm: 1,
  sqft: 10.7639104,
  acres: 0.000247105,
  hectares: 0.0001
}

function convertArea(val, fromUnit, toUnit) {
  if (val === '' || val === null || val === undefined || isNaN(val)) return val
  const numInSqm = parseFloat(val) / (UNIT_CONVERSION[fromUnit] || 1)
  const converted = numInSqm * (UNIT_CONVERSION[toUnit] || 1)
  return Number.isInteger(converted) ? converted.toString() : parseFloat(converted.toFixed(4)).toString()
}

function FileField({ label, name, accept, onChange, fileName }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <label className="file-input-wrapper">
        <input type="file" accept={accept} onChange={e => onChange(e.target.files[0])} />
        <span className="file-label">
          {fileName
            ? <span className="file-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Check size={14} /> {fileName}</span>
            : <span>Click to upload {label.toLowerCase()}</span>}
        </span>
      </label>
    </div>
  )
}

export default function ManagePage() {
  const { districtId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [plots, setPlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null) // plot id

  const [activeTab, setActiveTab] = useState('details')
  const [form, setForm] = useState({
    land_id: '',
    land_name: '',
    landmark: '',
    plot_type: '',
    address: '',
    year_of_registration: '',
    owner_name: ''
  })
  
  const [spatialData, setSpatialData] = useState({
    lat: '',
    lon: '',
    area: '',
    unit: 'sqm'
  })
  const [isEditingSpatial, setIsEditingSpatial] = useState(false)
  const [extractingKml, setExtractingKml] = useState(false)
  const [docSubcategory, setDocSubcategory] = useState('land_documents')

  const [kmlFile, setKmlFile] = useState(null)
  const [fmbFile, setFmbFile] = useState(null)
  const [pattaFile, setPattaFile] = useState(null)
  const [deedFile, setDeedFile] = useState(null)
  const [parentDocumentFile, setParentDocumentFile] = useState(null)
  const [ecDetailsFile, setEcDetailsFile] = useState(null)
  const [buildingPlanFile, setBuildingPlanFile] = useState(null)
  const [planApprovalLetterFile, setPlanApprovalLetterFile] = useState(null)
  const [buildingPermitLetterFile, setBuildingPermitLetterFile] = useState(null)
  const [propertyTaxFile, setPropertyTaxFile] = useState(null)
  const [aerialPhotoFile, setAerialPhotoFile] = useState(null)
  const [disputeDetailsFile, setDisputeDetailsFile] = useState(null)

  // Redirect if not admin
  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      navigate('/')
    }
  }, [user, navigate])

  function loadPlots() {
    setLoading(true)
    getPlots(districtId)
      .then(setPlots)
      .catch(err => setError(err.response?.data?.detail || 'Failed to load parcels.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (districtId) loadPlots()
  }, [districtId])

  function handleFormChange(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function processKmlFile(file) {
    setKmlFile(file)
    if (!file) return
    setExtractingKml(true)
    try {
      const data = await extractKml(file)
      const currentUnit = spatialData.unit || 'sqm'
      const convertedArea = convertArea(data.area_sqm, 'sqm', currentUnit)
      setSpatialData({
        lat: data.lat !== undefined && data.lat !== null ? data.lat.toString() : '',
        lon: data.lon !== undefined && data.lon !== null ? data.lon.toString() : '',
        area: convertedArea || '',
        unit: currentUnit
      })
    } catch (err) {
      console.error('Failed to extract KML spatial data:', err)
    } finally {
      setExtractingKml(false)
    }
  }

  function handleUnitChange(newUnit) {
    if (spatialData.area) {
      const converted = convertArea(spatialData.area, spatialData.unit, newUnit)
      setSpatialData(s => ({ ...s, area: converted, unit: newUnit }))
    } else {
      setSpatialData(s => ({ ...s, unit: newUnit }))
    }
  }

  function resetForm() {
    setForm({ land_id: '', land_name: '', landmark: '', plot_type: '', address: '', year_of_registration: '', owner_name: '' })
    setKmlFile(null)
    setSpatialData({ lat: '', lon: '', area: '', unit: 'sqm' })
    setIsEditingSpatial(false)
    setExtractingKml(false)
    setFmbFile(null)
    setPattaFile(null)
    setDeedFile(null)
    setParentDocumentFile(null)
    setEcDetailsFile(null)
    setBuildingPlanFile(null)
    setPlanApprovalLetterFile(null)
    setBuildingPermitLetterFile(null)
    setPropertyTaxFile(null)
    setAerialPhotoFile(null)
    setDisputeDetailsFile(null)
    setFormError('')
    setActiveTab('details')
    setDocSubcategory('land_documents')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    if (!kmlFile) {
      setFormError('KML file is required.')
      return
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('district_id', districtId)
      fd.append('land_id', form.land_id.trim())
      fd.append('land_name', form.land_name.trim())
      if (form.landmark.trim()) fd.append('landmark', form.landmark.trim())
      if (form.plot_type.trim()) fd.append('plot_type', form.plot_type.trim())
      if (form.address.trim()) fd.append('address', form.address.trim())
      if (form.year_of_registration.trim()) fd.append('year_of_registration', form.year_of_registration.trim())
      if (form.owner_name.trim()) fd.append('owner_name', form.owner_name.trim())
      
      if (spatialData.lat) fd.append('lat', spatialData.lat)
      if (spatialData.lon) fd.append('lon', spatialData.lon)
      if (spatialData.area) fd.append('area_value', spatialData.area)
      if (spatialData.unit) fd.append('area_unit', spatialData.unit)

      fd.append('kml_file', kmlFile)
      if (fmbFile) fd.append('fmb_file', fmbFile)
      if (pattaFile) fd.append('patta_file', pattaFile)
      if (deedFile) fd.append('deed_file', deedFile)
      if (parentDocumentFile) fd.append('parent_document_file', parentDocumentFile)
      if (ecDetailsFile) fd.append('ec_details_file', ecDetailsFile)
      if (buildingPlanFile) fd.append('building_plan_file', buildingPlanFile)
      if (planApprovalLetterFile) fd.append('plan_approval_letter_file', planApprovalLetterFile)
      if (buildingPermitLetterFile) fd.append('building_permit_letter_file', buildingPermitLetterFile)
      if (propertyTaxFile) fd.append('property_tax_file', propertyTaxFile)
      if (aerialPhotoFile) fd.append('aerial_photo_file', aerialPhotoFile)
      if (disputeDetailsFile) fd.append('dispute_details_file', disputeDetailsFile)

      await createPlot(fd)
      resetForm()
      setShowForm(false)
      loadPlots()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to create parcel.')
    } finally {
      setSubmitting(false)
    }
  }



  async function handleDelete(plotId) {
    try {
      await deletePlot(plotId)
      setDeleteConfirm(null)
      loadPlots()
    } catch (err) {
      alert(err.response?.data?.detail || 'Delete failed.')
    }
  }

  return (
    <div className="page-container">
      <Header />
      <div className="content-wrapper">
        {/* Breadcrumb */}
        <nav className="breadcrumb">
          <a href="/">Home</a>
          <span className="breadcrumb-sep">›</span>
          <button onClick={() => navigate(-1)}>Update Records</button>
          <span className="breadcrumb-sep">›</span>
          <span>Coimbatore</span>
        </nav>

        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: '700' }}>
              Coimbatore — Land Parcels
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              {plots.length} parcels registered
            </p>
          </div>
          <button
            id="btn-add-parcel"
            className="btn btn-primary"
            onClick={() => { resetForm(); setShowForm(true) }}
          >
            + Add New Parcel
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Parcels Table */}
        {loading ? (
          <div className="loading-center"><span className="spinner" /></div>
        ) : plots.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '3rem' }}>
            <p style={{ fontSize: '1rem' }}>No parcels yet.</p>
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Click <strong>+ Add New Parcel</strong> to get started.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Land ID</th>
                  <th>Name</th>
                  <th>Area</th>
                  <th>Location</th>
                  <th>Docs</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plots.map(plot => (
                  <tr key={plot.id}>
                    <td>
                      <span className="badge badge-blue">{plot.plot_number || '—'}</span>
                    </td>
                    <td style={{ fontWeight: '500' }}>{plot.property_name || '—'}</td>
                    <td style={{ color: 'var(--color-text-muted)' }}>
                      {plot.area_value
                        ? `${Number(plot.area_value).toLocaleString()} ${plot.area_unit}`
                        : '—'}
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.825rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {plot.location_name || (plot.lat && plot.lon ? `${plot.lat.toFixed(4)}, ${plot.lon.toFixed(4)}` : '—')}
                    </td>
                    <td>
                      {plot.documents && plot.documents.length > 0
                        ? <span className="badge badge-green">{plot.documents.length} docs</span>
                        : <span className="badge badge-gray">None</span>}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteConfirm(plot.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Parcel Modal */}
        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal modal-large" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">Add New Parcel</span>
                <button className="btn-outline" style={{ border: 'none', padding: '0.2rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowForm(false)}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-header-nav">
                <button className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('details')}><Info size={18}/> Details</button>
                <button className={`tab-btn ${activeTab === 'spatial' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('spatial')}><Map size={18}/> Spatial</button>
                <button className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('documents')}><FileText size={18}/> Documents</button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div className="modal-body-scrollable">
                  {formError && <div className="alert alert-error">{formError}</div>}
                  
                  {activeTab === 'details' && (
                    <div className="tab-content">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label className="form-label">Land ID *</label>
                          <input className="form-input" placeholder="e.g. CB1" value={form.land_id} onChange={e => handleFormChange('land_id', e.target.value)} required />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Land Name *</label>
                          <input className="form-input" placeholder="e.g. Ganesh Nagar Plot A" value={form.land_name} onChange={e => handleFormChange('land_name', e.target.value)} required />
                        </div>
                      </div>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label className="form-label">Year of registration</label>
                          <input className="form-input" placeholder="e.g. 2015" value={form.year_of_registration} onChange={e => handleFormChange('year_of_registration', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Owner name</label>
                          <input className="form-input" placeholder="e.g. John Doe" value={form.owner_name} onChange={e => handleFormChange('owner_name', e.target.value)} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Type</label>
                        <input className="form-input" placeholder="e.g. Plot area with building" value={form.plot_type} onChange={e => handleFormChange('plot_type', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Address</label>
                        <textarea className="form-textarea" placeholder="Accurate location" value={form.address} onChange={e => handleFormChange('address', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Landmark</label>
                        <input className="form-input" placeholder="e.g. Near bus stand" value={form.landmark} onChange={e => handleFormChange('landmark', e.target.value)} />
                      </div>
                    </div>
                  )}

                  {activeTab === 'spatial' && (
                    <div className="tab-content">
                      <div className="doc-section">
                        <label className="form-label" style={{ fontWeight: '700', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Upload size={16} /> Upload KML File *
                        </label>
                        <input type="file" accept=".kml,.kmz" onChange={e => processKmlFile(e.target.files[0])} style={{ fontSize: '0.9rem', width: '100%' }} />
                        {kmlFile && (
                          <p style={{ fontSize: '0.85rem', color: 'var(--color-success)', marginTop: '0.5rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Check size={14} /> {kmlFile.name}
                          </p>
                        )}
                      </div>

                      <div className="doc-section">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                          <h4 className="doc-section-title" style={{ margin: 0 }}>Geographic Information</h4>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              type="button"
                              className={`btn btn-sm ${isEditingSpatial ? 'btn-primary' : 'btn-outline'}`}
                              onClick={() => setIsEditingSpatial(!isEditingSpatial)}
                              title={isEditingSpatial ? 'Finish editing spatial values' : 'Enable manual editing of spatial values'}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                              <Pencil size={14} />
                              <span>{isEditingSpatial ? 'Done' : 'Edit'}</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => kmlFile && processKmlFile(kmlFile)}
                              disabled={!kmlFile || extractingKml}
                              title="Refresh calculated values from KML"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                              <RefreshCw size={14} className={extractingKml ? 'spinner' : ''} />
                              <span>Refresh</span>
                            </button>
                          </div>
                        </div>

                        {/* Lat and Long side-by-side (2 columns) */}
                        <div className="form-grid-2" style={{ marginBottom: '1rem' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-muted)' }}>
                              Latitude
                            </label>
                            <input
                              type="number"
                              step="any"
                              className={`form-input ${!isEditingSpatial ? 'form-input-disabled' : ''}`}
                              placeholder={extractingKml ? 'Extracting...' : 'e.g. 11.0168'}
                              value={spatialData.lat}
                              onChange={e => setSpatialData(s => ({ ...s, lat: e.target.value }))}
                              disabled={!isEditingSpatial}
                            />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-muted)' }}>
                              Longitude
                            </label>
                            <input
                              type="number"
                              step="any"
                              className={`form-input ${!isEditingSpatial ? 'form-input-disabled' : ''}`}
                              placeholder={extractingKml ? 'Extracting...' : 'e.g. 76.9558'}
                              value={spatialData.lon}
                              onChange={e => setSpatialData(s => ({ ...s, lon: e.target.value }))}
                              disabled={!isEditingSpatial}
                            />
                          </div>
                        </div>

                        {/* Area preview below in 1 long line with unit dropdown on the right side */}
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-muted)' }}>
                            Area Preview
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                            <input
                              type="number"
                              step="any"
                              className={`form-input ${!isEditingSpatial ? 'form-input-disabled' : ''}`}
                              style={{ flex: 1 }}
                              placeholder={extractingKml ? 'Extracting area...' : 'Calculated Area'}
                              value={spatialData.area}
                              onChange={e => setSpatialData(s => ({ ...s, area: e.target.value }))}
                              disabled={!isEditingSpatial}
                            />
                            <select
                              className="form-input"
                              style={{ width: '130px', flexShrink: 0, fontWeight: '600' }}
                              value={spatialData.unit}
                              onChange={e => handleUnitChange(e.target.value)}
                            >
                              {AREA_UNITS.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'documents' && (
                    <div className="tab-content">
                      {/* Subcategory Dropdown Selector (Full Width at Top) */}
                      <div className="doc-section" style={{ padding: '1rem 1.25rem' }}>
                        <label className="form-label" style={{ fontWeight: '700', marginBottom: '0.5rem', display: 'block' }}>
                          Select Document Subcategory
                        </label>
                        <select
                          className="form-input"
                          style={{ width: '100%', fontWeight: '600', fontSize: '0.95rem', padding: '0.65rem 0.85rem' }}
                          value={docSubcategory}
                          onChange={e => setDocSubcategory(e.target.value)}
                        >
                          <option value="land_documents">Land Documents</option>
                          <option value="buildup_details">Build-up Details</option>
                          <option value="others">Others</option>
                        </select>
                      </div>

                      {/* Selected Subcategory Document Upload Fields (Stacked One Below Another in Full Width) */}
                      <div className="doc-section">
                        {docSubcategory === 'land_documents' && (
                          <div>
                            <h4 className="doc-section-title">Land Documents</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <FileField label="Deed Document" accept=".pdf" onChange={setDeedFile} fileName={deedFile?.name} />
                              <FileField label="Parent Document" accept=".pdf" onChange={setParentDocumentFile} fileName={parentDocumentFile?.name} />
                              <FileField label="FMB Sketch" accept=".pdf" onChange={setFmbFile} fileName={fmbFile?.name} />
                              <FileField label="Patta / Chitta Details" accept=".pdf" onChange={setPattaFile} fileName={pattaFile?.name} />
                              <FileField label="EC Details" accept=".pdf" onChange={setEcDetailsFile} fileName={ecDetailsFile?.name} />
                            </div>
                          </div>
                        )}

                        {docSubcategory === 'buildup_details' && (
                          <div>
                            <h4 className="doc-section-title">Build-up Details</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <FileField label="Building Plan" accept=".pdf" onChange={setBuildingPlanFile} fileName={buildingPlanFile?.name} />
                              <FileField label="Plan Approval Letter" accept=".pdf" onChange={setPlanApprovalLetterFile} fileName={planApprovalLetterFile?.name} />
                              <FileField label="Building Permit Letter" accept=".pdf" onChange={setBuildingPermitLetterFile} fileName={buildingPermitLetterFile?.name} />
                            </div>
                          </div>
                        )}

                        {docSubcategory === 'others' && (
                          <div>
                            <h4 className="doc-section-title">Others</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <FileField label="Property Tax" accept=".pdf" onChange={setPropertyTaxFile} fileName={propertyTaxFile?.name} />
                              <FileField label="Aerial/Field Photos" accept=".pdf" onChange={setAerialPhotoFile} fileName={aerialPhotoFile?.name} />
                              <FileField label="Dispute Details" accept=".pdf" onChange={setDisputeDetailsFile} fileName={disputeDetailsFile?.name} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting || !form.land_id || !form.land_name || !kmlFile}>
                    {submitting ? 'Saving…' : 'Create Parcel'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirm Modal */}
        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">Confirm Delete</span>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete this parcel? This action cannot be undone.</p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>
                  Delete Parcel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
