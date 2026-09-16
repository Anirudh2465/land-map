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

const AREA_UNITS = ['sqm', 'sqft', 'acres', 'hectares']

function FileField({ label, name, accept, onChange, fileName }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <label className="file-input-wrapper">
        <input type="file" accept={accept} onChange={e => onChange(e.target.files[0])} />
        <span className="file-label">
          {fileName
            ? <span className="file-name">✔ {fileName}</span>
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

  // Form state
  const [form, setForm] = useState({
    land_id: '',
    land_name: '',
    area_value: '',
    area_unit: 'sqm',
    lat: '',
    lon: '',
    landmark: '',
  })
  const [kmlFile, setKmlFile] = useState(null)
  const [fmbFile, setFmbFile] = useState(null)
  const [pattaFile, setPattaFile] = useState(null)
  const [deedFile, setDeedFile] = useState(null)

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

  function resetForm() {
    setForm({ land_id: '', land_name: '', area_value: '', area_unit: 'sqm', lat: '', lon: '', landmark: '' })
    setKmlFile(null)
    setFmbFile(null)
    setPattaFile(null)
    setDeedFile(null)
    setFormError('')
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
      fd.append('area_value', parseFloat(form.area_value))
      fd.append('area_unit', form.area_unit)
      fd.append('lat', parseFloat(form.lat))
      fd.append('lon', parseFloat(form.lon))
      if (form.landmark.trim()) fd.append('landmark', form.landmark.trim())
      fd.append('kml_file', kmlFile)
      if (fmbFile) fd.append('fmb_file', fmbFile)
      if (pattaFile) fd.append('patta_file', pattaFile)
      if (deedFile) fd.append('deed_file', deedFile)

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

  const [autofilling, setAutofilling] = useState(false)
  async function handleAutofill() {
    if (!kmlFile) {
      setFormError('Please select a KML file first.')
      return
    }
    setAutofilling(true)
    setFormError('')
    try {
      const data = await extractKml(kmlFile)
      setForm(f => ({
        ...f,
        area_value: data.area_sqm.toFixed(2),
        area_unit: 'sqm',
        lat: data.lat.toFixed(6),
        lon: data.lon.toFixed(6),
      }))
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to extract KML details.')
    } finally {
      setAutofilling(false)
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
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">Add New Parcel</span>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  {formError && <div className="alert alert-error">{formError}</div>}

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="f-land-id">Land ID *</label>
                      <input
                        id="f-land-id"
                        className="form-input"
                        placeholder="e.g. CB1"
                        value={form.land_id}
                        onChange={e => handleFormChange('land_id', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="f-land-name">Land Name *</label>
                      <input
                        id="f-land-name"
                        className="form-input"
                        placeholder="e.g. Ganesh Nagar Plot A"
                        value={form.land_name}
                        onChange={e => handleFormChange('land_name', e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="f-area">Area *</label>
                      <input
                        id="f-area"
                        className="form-input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={form.area_value}
                        onChange={e => handleFormChange('area_value', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="f-area-unit">Unit *</label>
                      <select
                        id="f-area-unit"
                        className="form-input"
                        value={form.area_unit}
                        onChange={e => handleFormChange('area_unit', e.target.value)}
                      >
                        {AREA_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="f-lat">Latitude *</label>
                      <input
                        id="f-lat"
                        className="form-input"
                        type="number"
                        step="0.000001"
                        placeholder="11.0168"
                        value={form.lat}
                        onChange={e => handleFormChange('lat', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="f-lon">Longitude *</label>
                      <input
                        id="f-lon"
                        className="form-input"
                        type="number"
                        step="0.000001"
                        placeholder="76.9558"
                        value={form.lon}
                        onChange={e => handleFormChange('lon', e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="f-landmark">
                      Landmark <span className="optional">(optional)</span>
                    </label>
                    <input
                      id="f-landmark"
                      className="form-input"
                      placeholder="e.g. Near Coimbatore Central Bus Stand"
                      value={form.landmark}
                      onChange={e => handleFormChange('landmark', e.target.value)}
                    />
                  </div>

                  <FileField
                    label="KML File *"
                    name="kml_file"
                    accept=".kml,.kmz"
                    onChange={setKmlFile}
                    fileName={kmlFile?.name}
                  />
                  <div style={{ marginBottom: '1.5rem', marginTop: '-0.5rem', textAlign: 'right' }}>
                    <button 
                      type="button" 
                      className="btn btn-outline btn-sm" 
                      onClick={handleAutofill}
                      disabled={!kmlFile || autofilling}
                    >
                      {autofilling ? 'Extracting...' : '🪄 Autofill Area, Latitude & Longitude from KML'}
                    </button>
                  </div>
                  {/*
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 'var(--radius)',
                    fontSize: '0.8rem',
                    color: '#92400e',
                    marginBottom: '1rem',
                  }}>
                    📎 Upload supporting documents (optional)
                  </div>
                  */}
                  <FileField
                    label="FMB Document"
                    name="fmb_file"
                    accept=".pdf"
                    onChange={setFmbFile}
                    fileName={fmbFile?.name}
                  />
                  <FileField
                    label="Patta Document"
                    name="patta_file"
                    accept=".pdf"
                    onChange={setPattaFile}
                    fileName={pattaFile?.name}
                  />
                  <FileField
                    label="Deed Document"
                    name="deed_file"
                    accept=".pdf"
                    onChange={setDeedFile}
                    fileName={deedFile?.name}
                  />
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-submit-parcel"
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? <><span className="spinner" /> Saving…</> : 'Create Parcel'}
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
