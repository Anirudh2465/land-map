/**
 * ManagePage — Admin portal for managing land parcels in a district.
 * Route: /manage/:districtId
 *
 * Features:
 *  - List all parcels in the district
 *  - Add New Parcel form (modal) with KML + 3 PDF uploads
 *  - Delete parcel (soft-delete)
 */
import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getPlots, getPlot, createPlot, updatePlot, deletePlot, extractKml } from '../api/plots'
import { getChildren, createVillage, renameVillage, deleteVillage, getNode, resolveGeoPath, getCountries } from '../api/geo'
import { deleteDocument } from '../api/documents'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import { Map, Info, FileText, Upload, Check, X, Pencil, RefreshCw, Trash2, Plus, ArrowLeft, ChevronRight } from 'lucide-react'

function toSlug(name) {
  if (!name) return ''
  return encodeURIComponent(name.trim().replace(/\s+/g, '-'))
}

function fromSlug(slug) {
  if (!slug) return ''
  return decodeURIComponent(slug).replace(/[-_]/g, ' ')
}

function isUuid(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

const DOC_CATEGORIES = {
  land_documents: ['DEED', 'PARENT_DOCUMENT', 'FMB', 'PATTA', 'EC_DETAILS', 'ADANGAL', 'A_REGISTER'],
  land_official_details: ['PROPERTY_TAX', 'AERIAL_PHOTO', 'DISPUTE_DETAILS', 'APPROVED_PLAN'],
  buildup_details: ['BUILDING_PLAN', 'PLAN_APPROVAL', 'BUILDING_PERMIT'],
  source_files: ['SOURCE_KML', 'SHAPEFILE'],
  others: ['PROPERTY_TAX', 'AERIAL_PHOTO', 'DISPUTE_DETAILS', 'APPROVED_PLAN']
}

const DOC_TITLES = {
  DEED: 'Deed Document',
  PARENT_DOCUMENT: 'Parent Document',
  FMB: 'TSLR Sketch',
  PATTA: 'Patta / Chitta Details',
  EC_DETAILS: 'EC Details',
  BUILDING_PLAN: 'Building Plan',
  PLAN_APPROVAL: 'Plan Approval Letter',
  BUILDING_PERMIT: 'Building Permit Letter',
  PROPERTY_TAX: 'Property Tax',
  AERIAL_PHOTO: 'Aerial / Field Photos',
  DISPUTE_DETAILS: 'Dispute Details',
  ADANGAL: 'Adangal',
  A_REGISTER: 'A-Register',
  APPROVED_PLAN: 'Approved Industry / Residential Plan',
  SOURCE_KML: 'Source KML File',
  SHAPEFILE: 'Shapefile'
}

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

function FileField({ label, name, accept, onChange, files }) {
  const numFiles = files && files.length ? files.length : 0
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <label className="file-input-wrapper">
        <input type="file" accept={accept} multiple onChange={e => onChange(Array.from(e.target.files))} />
        <span className="file-label">
          {numFiles > 0
            ? <span className="file-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Check size={14} /> {numFiles} file{numFiles > 1 ? 's' : ''} selected</span>
            : <span>Click to upload {label.toLowerCase()}</span>}
        </span>
      </label>
    </div>
  )
}

export default function ManagePage() {
  const params = useParams()
  const splat = params['*'] || ''
  const segments = useMemo(() => splat.split('/').filter(Boolean), [splat])

  const navigate = useNavigate()
  const { user } = useAuth()

  // ── Step & Hierarchy state ─────────────────────────────────────────────
  // 0: Region, 1: State, 2: District, 3: Taluk, 4: Village Card, 5: Village Parcels, 10: Overseas Country, 11: Overseas Parcels
  const [activeStep, setActiveStep] = useState(0)
  const [chain, setChain] = useState([])
  const [loadingStep, setLoadingStep] = useState(false)

  const [countries, setCountries] = useState([])
  const [states, setStates] = useState([])
  const [districts, setDistricts] = useState([])
  const [taluks, setTaluks] = useState([])
  const [villages, setVillages] = useState([])

  const [selectedStateId, setSelectedStateId] = useState('')
  const [selectedDistrictId, setSelectedDistrictId] = useState('')
  const [selectedTalukId, setSelectedTalukId] = useState('')
  const [selectedVillageChoiceId, setSelectedVillageChoiceId] = useState('')
  const [selectedOverseasId, setSelectedOverseasId] = useState('')

  // Resolved Nodes
  const countryNode = chain.find(c => c.level === 'COUNTRY') || null
  const stateNode = chain.find(c => c.level === 'STATE') || null
  const districtNode = chain.find(c => c.level === 'DISTRICT') || null
  const talukNode = chain.find(c => c.level === 'TALUK') || null
  const villageNode = chain.find(c => c.level === 'VILLAGE') || null
  const selectedVillage = villageNode || (activeStep === 11 ? countryNode : null)

  // ── Village layer state ────────────────────────────────────────────────
  const [newVillageName, setNewVillageName] = useState('')
  const [showAddVillage, setShowAddVillage] = useState(false)
  const [addVillageError, setAddVillageError] = useState('')
  const [addVillageLoading, setAddVillageLoading] = useState(false)
  const [renameVillageId, setRenameVillageId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)
  const [deleteVillageConfirm, setDeleteVillageConfirm] = useState(null)  // village node
  const [deletingVillage, setDeletingVillage] = useState(false)

  const [plots, setPlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
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

  const [editingPlotId, setEditingPlotId] = useState(null)
  const [existingDocs, setExistingDocs] = useState([])
  const [deletingDocId, setDeletingDocId] = useState(null)

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
  const [adangalFile, setAdangalFile] = useState(null)
  const [aRegisterFile, setARegisterFile] = useState(null)
  const [approvedPlanFile, setApprovedPlanFile] = useState(null)
  const [sourceKmlFile, setSourceKmlFile] = useState(null)
  const [shapefileFile, setShapefileFile] = useState(null)

  // Redirect if not admin
  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      navigate('/')
    }
  }, [user, navigate])

  const canonicalVillagePath = useMemo(() => {
    if (activeStep === 11 && segments.length >= 2) {
      return 'Overseas/' + segments[1]
    }
    if (segments.length >= 5) {
      return 'India/' + segments[1] + '/' + segments[2] + '/' + segments[3] + '/' + segments[4]
    }
    return ''
  }, [activeStep, segments])

  function openParcelModal(plot) {
    if (canonicalVillagePath) {
      navigate('/manage/' + canonicalVillagePath + '/' + plot.id)
    } else {
      handleEditPlot(plot)
    }
  }

  function handleAddNewParcel() {
    resetForm()
    setShowForm(true)
  }

  function closeParcelModal() {
    resetForm()
    setShowForm(false)
    if (canonicalVillagePath) {
      navigate('/manage/' + canonicalVillagePath)
    }
  }

  function loadPlots(targetNodeId) {
    const id = targetNodeId || selectedVillage?.id
    if (!id) return
    setLoading(true)
    getPlots(id)
      .then(async (fetchedPlots) => {
        setPlots(fetchedPlots)
        const lastSeg = segments[segments.length - 1]
        if (isUuid(lastSeg)) {
          const match = fetchedPlots.find(p => p.id === lastSeg)
          if (match) {
            handleEditPlot(match)
          } else {
            try {
              const single = await getPlot(lastSeg)
              if (single) handleEditPlot(single)
            } catch {}
          }
        }
      })
      .catch(err => setError(err.response?.data?.detail || 'Failed to load parcels.'))
      .finally(() => setLoading(false))
  }

  // URL Path Synchronization
  useEffect(() => {
    let isCancelled = false
    async function syncFromUrl() {
      setLoadingStep(true)
      try {
        if (segments.length === 0) {
          setActiveStep(0)
          setChain([])
          setShowForm(false)
          setEditingPlotId(null)
          const c = await getCountries().catch(() => [])
          if (!isCancelled) setCountries(c)
          return
        }

        // Single UUID legacy route check (e.g. /manage/8464db86-...)
        if (segments.length === 1 && isUuid(segments[0])) {
          const res = await resolveGeoPath(segments[0]).catch(() => null)
          if (res && res.canonical_path) {
            navigate('/manage/' + res.canonical_path, { replace: true })
            return
          }
        }

        // Overseas Flow
        if (segments[0].toLowerCase() === 'overseas') {
          if (segments.length === 1) {
            setActiveStep(10)
            setShowForm(false)
            setEditingPlotId(null)
            const cList = await getCountries().catch(() => [])
            const overseas = cList.filter(c => c.name !== 'India')
            if (!isCancelled) {
              setCountries(overseas)
              if (overseas.length > 0) setSelectedOverseasId(overseas[0].id)
            }
          } else {
            setActiveStep(11)
            const res = await resolveGeoPath(splat).catch(() => null)
            if (res && !isCancelled) {
              setChain(res.chain)
              if (res.current_node) {
                loadPlots(res.current_node.id)
              }
            }
          }
          return
        }

        // India Flow
        if (segments[0].toLowerCase() === 'india') {
          const res = await resolveGeoPath(splat).catch(() => null)
          if (isCancelled || !res) return
          setChain(res.chain)

          const india = res.chain.find(c => c.level === 'COUNTRY') || res.chain[0]

          if (segments.length === 1) {
            setActiveStep(1)
            setShowForm(false)
            setEditingPlotId(null)
            if (india) {
              const stList = await getChildren(india.id).catch(() => [])
              const sorted = [...stList].sort((a, b) => {
                if (a.name === 'Tamil Nadu') return -1
                if (b.name === 'Tamil Nadu') return 1
                return a.name.localeCompare(b.name)
              })
              if (!isCancelled) {
                setStates(sorted)
                const tn = sorted.find(s => s.name === 'Tamil Nadu') || sorted[0]
                if (tn) setSelectedStateId(tn.id)
              }
            }
          } else if (segments.length === 2) {
            setActiveStep(2)
            setShowForm(false)
            setEditingPlotId(null)
            const currState = res.chain.find(c => c.level === 'STATE')
            if (currState) {
              const dtList = await getChildren(currState.id).catch(() => [])
              const sorted = [...dtList].sort((a, b) => {
                if (a.name === 'Coimbatore') return -1
                if (b.name === 'Coimbatore') return 1
                return a.name.localeCompare(b.name)
              })
              if (!isCancelled) {
                setDistricts(sorted)
                const cbe = sorted.find(d => d.name === 'Coimbatore') || sorted[0]
                if (cbe) setSelectedDistrictId(cbe.id)
              }
            }
          } else if (segments.length === 3) {
            setActiveStep(3)
            setShowForm(false)
            setEditingPlotId(null)
            const currDistrict = res.chain.find(c => c.level === 'DISTRICT')
            if (currDistrict) {
              const tlList = await getChildren(currDistrict.id).catch(() => [])
              if (!isCancelled) {
                setTaluks(tlList)
                if (tlList.length > 0) setSelectedTalukId(tlList[0].id)
              }
            }
          } else if (segments.length === 4) {
            setActiveStep(4)
            setShowForm(false)
            setEditingPlotId(null)
            const currTaluk = res.chain.find(c => c.level === 'TALUK')
            if (currTaluk) {
              const vlList = await getChildren(currTaluk.id).catch(() => [])
              if (!isCancelled) {
                setVillages(vlList)
                if (vlList.length > 0) setSelectedVillageChoiceId(vlList[0].id)
                else setSelectedVillageChoiceId('')
              }
            }
          } else if (segments.length >= 5) {
            setActiveStep(5)
            const currVillage = res.chain.find(c => c.level === 'VILLAGE') || res.current_node
            if (currVillage) {
              loadPlots(currVillage.id)
              if (currVillage.parent_id) {
                getChildren(currVillage.parent_id).then(vlList => {
                  if (!isCancelled) setVillages(vlList)
                }).catch(() => {})
              }
            }
          }
        }
      } finally {
        if (!isCancelled) setLoadingStep(false)
      }
    }

    syncFromUrl()
    return () => { isCancelled = true }
  }, [splat])

  function handleFormChange(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function processKmlFile(file) {
    setKmlFile(file)
    if (!file) return
    setExtractingKml(true)
    setFormError('')
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
      const errMsg = err.response?.data?.detail || 'Failed to extract KML coordinates and boundaries.'
      setFormError(errMsg)
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
    setEditingPlotId(null)
    setExistingDocs([])
    setDeletingDocId(null)
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
    setAdangalFile(null)
    setARegisterFile(null)
    setApprovedPlanFile(null)
    setSourceKmlFile(null)
    setShapefileFile(null)
    setFormError('')
    setActiveTab('details')
    setDocSubcategory('land_documents')
  }

  async function handleEditPlot(plot) {
    resetForm()
    setEditingPlotId(plot.id)
    setForm({
      land_id: plot.plot_number || '',
      land_name: plot.property_name || '',
      landmark: plot.landmark || '',
      plot_type: plot.plot_type || '',
      address: plot.address || '',
      year_of_registration: plot.year_of_registration || '',
      owner_name: plot.owner_name || ''
    })
    setSpatialData({
      lat: plot.lat !== undefined && plot.lat !== null ? plot.lat.toString() : '',
      lon: plot.lon !== undefined && plot.lon !== null ? plot.lon.toString() : '',
      area: plot.area_value !== undefined && plot.area_value !== null ? plot.area_value.toString() : '',
      unit: plot.area_unit || 'sqm'
    })
    setExistingDocs(plot.documents || [])
    setShowForm(true)

    try {
      const fullPlot = await getPlot(plot.id)
      if (fullPlot && fullPlot.documents) {
        setExistingDocs(fullPlot.documents)
      }
    } catch (err) {
      console.error('Failed to load fresh plot documents:', err)
    }
  }

  async function handleDeleteExistingDoc(docId) {
    if (!window.confirm('Are you sure you want to delete this document?')) return
    try {
      setDeletingDocId(docId)
      await deleteDocument(docId)
      setExistingDocs(prev => prev.filter(d => d.id !== docId))
      loadPlots()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete document.')
    } finally {
      setDeletingDocId(null)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    if (!editingPlotId && !kmlFile) {
      setFormError('KML file is required.')
      return
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      if (!editingPlotId) {
        fd.append('district_id', selectedVillage.id)
      }
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

      if (kmlFile) fd.append('kml_file', kmlFile)
      if (fmbFile) fmbFile.forEach(f => fd.append('fmb_file', f))
      if (pattaFile) pattaFile.forEach(f => fd.append('patta_file', f))
      if (deedFile) deedFile.forEach(f => fd.append('deed_file', f))
      if (parentDocumentFile) parentDocumentFile.forEach(f => fd.append('parent_document_file', f))
      if (ecDetailsFile) ecDetailsFile.forEach(f => fd.append('ec_details_file', f))
      if (buildingPlanFile) buildingPlanFile.forEach(f => fd.append('building_plan_file', f))
      if (planApprovalLetterFile) planApprovalLetterFile.forEach(f => fd.append('plan_approval_letter_file', f))
      if (buildingPermitLetterFile) buildingPermitLetterFile.forEach(f => fd.append('building_permit_letter_file', f))
      if (propertyTaxFile) propertyTaxFile.forEach(f => fd.append('property_tax_file', f))
      if (aerialPhotoFile) aerialPhotoFile.forEach(f => fd.append('aerial_photo_file', f))
      if (disputeDetailsFile) disputeDetailsFile.forEach(f => fd.append('dispute_details_file', f))
      if (adangalFile) adangalFile.forEach(f => fd.append('adangal_file', f))
      if (aRegisterFile) aRegisterFile.forEach(f => fd.append('a_register_file', f))
      if (approvedPlanFile) approvedPlanFile.forEach(f => fd.append('approved_plan_file', f))
      if (sourceKmlFile) sourceKmlFile.forEach(f => fd.append('source_kml_file', f))
      if (shapefileFile) shapefileFile.forEach(f => fd.append('shapefile_file', f))

      setUploadProgress(0)
      const onProgress = (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          setUploadProgress(percentCompleted)
        }
      }

      if (editingPlotId) {
        await updatePlot(editingPlotId, fd, onProgress)
      } else {
        await createPlot(fd, onProgress)
      }

      resetForm()
      setShowForm(false)
      setUploadProgress(0)
      if (canonicalVillagePath) {
        navigate('/manage/' + canonicalVillagePath)
      }
      loadPlots()
    } catch (err) {
      setFormError(err.response?.data?.detail || (editingPlotId ? 'Failed to update parcel.' : 'Failed to create parcel.'))
      setUploadProgress(0)
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

  // ── Village CRUD handlers ──────────────────────────────────────────────

  async function handleAddVillage() {
    const parentTalukId = talukNode?.id || selectedTalukId || (villages[0]?.parent_id)
    if (!newVillageName.trim()) {
      setAddVillageError('Please enter a village name.')
      return
    }
    if (!parentTalukId) {
      setAddVillageError('Parent taluk not identified. Please try selecting the taluk again.')
      return
    }
    setAddVillageLoading(true)
    setAddVillageError('')
    try {
      const village = await createVillage(parentTalukId, newVillageName.trim())
      setVillages(prev => [...prev, village].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedVillageChoiceId(village.id)
      setNewVillageName('')
      setShowAddVillage(false)
    } catch (err) {
      setAddVillageError(err.response?.data?.detail || 'Failed to create village.')
    } finally {
      setAddVillageLoading(false)
    }
  }

  function startRename(village) {
    setRenameVillageId(village.id)
    setRenameValue(village.name)
    setRenameError('')
  }

  async function handleRenameVillage() {
    if (!renameValue.trim() || !renameVillageId) return
    setRenameLoading(true)
    setRenameError('')
    try {
      const updated = await renameVillage(renameVillageId, renameValue.trim())
      setVillages(prev => prev.map(v => v.id === renameVillageId ? { ...v, name: updated.name } : v))
      setRenameVillageId(null)
      const newSlug = toSlug(updated.name)
      navigate('/manage/India/' + segments[1] + '/' + segments[2] + '/' + segments[3] + '/' + newSlug, { replace: true })
    } catch (err) {
      setRenameError(err.response?.data?.detail || 'Failed to rename village.')
    } finally {
      setRenameLoading(false)
    }
  }

  async function handleDeleteVillage(village) {
    setDeletingVillage(true)
    try {
      await deleteVillage(village.id)
      setVillages(prev => prev.filter(v => v.id !== village.id))
      setDeleteVillageConfirm(null)
      navigate('/manage/India/' + segments[1] + '/' + segments[2] + '/' + segments[3])
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete village.')
    } finally {
      setDeletingVillage(false)
    }
  }

  // ── Navigation step continue handlers ──────────────────────────────────
  function handleStateContinue() {
    const st = states.find(s => s.id === selectedStateId) || states[0]
    if (!st) return
    navigate('/manage/India/' + toSlug(st.name))
  }

  function handleDistrictContinue() {
    const dt = districts.find(d => d.id === selectedDistrictId) || districts[0]
    if (!dt) return
    navigate('/manage/India/' + segments[1] + '/' + toSlug(dt.name))
  }

  function handleTalukContinue() {
    const tl = taluks.find(t => t.id === selectedTalukId) || taluks[0]
    if (!tl) return
    navigate('/manage/India/' + segments[1] + '/' + segments[2] + '/' + toSlug(tl.name))
  }

  function handleVillageContinue() {
    const vl = villages.find(v => v.id === selectedVillageChoiceId) || villages[0]
    if (!vl) return
    navigate('/manage/India/' + segments[1] + '/' + segments[2] + '/' + segments[3] + '/' + toSlug(vl.name))
  }

  function handleOverseasContinue() {
    const c = countries.find(co => co.id === selectedOverseasId) || countries[0]
    if (!c) return
    navigate('/manage/Overseas/' + toSlug(c.name))
  }

  function handleBack() {
    if (showForm) {
      closeParcelModal()
      return
    }

    if (activeStep === 5) {
      navigate('/manage/India/' + segments[1] + '/' + segments[2] + '/' + segments[3])
      return
    }

    if (activeStep === 4) {
      navigate('/manage/India/' + segments[1] + '/' + segments[2])
      return
    }

    if (activeStep === 3) {
      navigate('/manage/India/' + segments[1])
      return
    }

    if (activeStep === 2) {
      navigate('/manage/India')
      return
    }

    if (activeStep === 1) {
      navigate('/manage')
      return
    }

    if (activeStep === 11) {
      navigate('/manage/Overseas')
      return
    }

    if (activeStep === 10) {
      navigate('/manage')
      return
    }

    navigate('/')
  }

  const getHeaderCenter = () => {
    if (activeStep === 0) {
      return <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Update Records › Select Region</span>
    }
    if (activeStep === 1) {
      return <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>India › Select State</span>
    }
    if (activeStep === 2) {
      return <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{stateNode?.name || fromSlug(segments[1])} › Select District</span>
    }
    if (activeStep === 3) {
      return <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{stateNode?.name || fromSlug(segments[1])} › {districtNode?.name || fromSlug(segments[2])} › Select Taluk</span>
    }
    if (activeStep === 4) {
      return <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{districtNode?.name || fromSlug(segments[2])} › {talukNode?.name || fromSlug(segments[3])} › Select Village</span>
    }
    if (activeStep === 5) {
      const vName = villageNode?.name || fromSlug(segments[4])
      const tName = talukNode?.name || fromSlug(segments[3])
      if (showForm && form.land_id) {
        return <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{vName} › {form.land_id}</span>
      }
      return <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{tName} › {vName}</span>
    }
    if (activeStep === 10) {
      return <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Overseas › Select Country</span>
    }
    if (activeStep === 11) {
      return <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Overseas › {countryNode?.name || fromSlug(segments[1])}</span>
    }
    return <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Update Records</span>
  }

  return (
    <div className="home-page-container">
      {/* Background image layer with blur and darkening */}
      <div className="home-bg-layer" />

      {/* Header */}
      <Header
        onBack={handleBack}
        centerContent={getHeaderCenter()}
      />

      {/* Content Wrapper */}
      <div
        className="content-wrapper"
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: (activeStep === 5 || activeStep === 11) ? '1100px' : '100%',
          margin: '0 auto',
          padding: (activeStep === 5 || activeStep === 11) ? '2rem 1.5rem' : '1.25rem 1.5rem',
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Breadcrumb (visible on all steps > 0) */}
        {activeStep > 0 && (
          <nav
            className="breadcrumb"
            style={{
              marginBottom: (activeStep === 5 || activeStep === 11) ? '1.25rem' : '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
              width: '100%',
              maxWidth: '1100px',
              margin: (activeStep === 5 || activeStep === 11) ? undefined : '0 auto',
            }}
          >
            <a href="/" style={{ color: 'rgba(255, 255, 255, 0.8)', textDecoration: 'none', fontWeight: '500' }}>Home</a>
            <span className="breadcrumb-sep" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>›</span>
            <button
              onClick={() => navigate('/manage')}
              style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255, 255, 255, 0.8)', cursor: 'pointer', fontWeight: '500', textDecoration: activeStep > 0 ? 'underline' : 'none' }}
            >
              Update Records
            </button>

            {segments[0]?.toLowerCase() === 'overseas' && (
              <>
                <span className="breadcrumb-sep" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>›</span>
                {segments.length > 1 ? (
                  <button
                    onClick={() => navigate('/manage/Overseas')}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255, 255, 255, 0.8)', cursor: 'pointer', fontWeight: '500', textDecoration: 'underline' }}
                  >
                    Overseas
                  </button>
                ) : (
                  <span style={{ color: '#ffffff', fontWeight: '600' }}>Overseas</span>
                )}
                {segments[1] && (
                  <>
                    <span className="breadcrumb-sep" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>›</span>
                    <span style={{ color: '#ffffff', fontWeight: '600' }}>{countryNode?.name || fromSlug(segments[1])}</span>
                  </>
                )}
              </>
            )}

            {segments[0]?.toLowerCase() === 'india' && (
              <>
                {segments[1] && (
                  <>
                    <span className="breadcrumb-sep" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>›</span>
                    {segments.length > 2 ? (
                      <button
                        onClick={() => navigate('/manage/India/' + segments[1])}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255, 255, 255, 0.8)', cursor: 'pointer', fontWeight: '500', textDecoration: 'underline' }}
                      >
                        {stateNode?.name || fromSlug(segments[1])}
                      </button>
                    ) : (
                      <span style={{ color: '#ffffff', fontWeight: '600' }}>{stateNode?.name || fromSlug(segments[1])}</span>
                    )}
                  </>
                )}
                {segments[2] && (
                  <>
                    <span className="breadcrumb-sep" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>›</span>
                    {segments.length > 3 ? (
                      <button
                        onClick={() => navigate('/manage/India/' + segments[1] + '/' + segments[2])}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255, 255, 255, 0.8)', cursor: 'pointer', fontWeight: '500', textDecoration: 'underline' }}
                      >
                        {districtNode?.name || fromSlug(segments[2])}
                      </button>
                    ) : (
                      <span style={{ color: '#ffffff', fontWeight: '600' }}>{districtNode?.name || fromSlug(segments[2])}</span>
                    )}
                  </>
                )}
                {segments[3] && (
                  <>
                    <span className="breadcrumb-sep" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>›</span>
                    {segments.length > 4 ? (
                      <button
                        onClick={() => navigate('/manage/India/' + segments[1] + '/' + segments[2] + '/' + segments[3])}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255, 255, 255, 0.8)', cursor: 'pointer', fontWeight: '500', textDecoration: 'underline' }}
                      >
                        {talukNode?.name || fromSlug(segments[3])}
                      </button>
                    ) : (
                      <span style={{ color: '#ffffff', fontWeight: '600' }}>{talukNode?.name || fromSlug(segments[3])}</span>
                    )}
                  </>
                )}
                {segments[4] && (
                  <>
                    <span className="breadcrumb-sep" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>›</span>
                    <span style={{ color: '#ffffff', fontWeight: '600' }}>{villageNode?.name || fromSlug(segments[4])}</span>
                  </>
                )}
              </>
            )}
          </nav>
        )}

        {/* ── Step 0: Select Region ───────────────────────────────────── */}
        {activeStep === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 'calc(100vh - 140px)' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <img src="/logo.png" alt="LMS Logo" style={{ height: '84px', width: 'auto', marginBottom: '0.85rem', filter: 'brightness(0) invert(1) drop-shadow(0 2px 10px rgba(0, 0, 0, 0.5))' }} />
              <h1 className="home-hero-title">Update Records</h1>
              <p className="home-hero-subtitle">Administrative Portal to Manage &amp; Update Parcel Database</p>
            </div>
            <div className="map-selection-card" style={{ width: '100%', maxWidth: '440px' }}>
              <div className="map-selection-header">
                <div className="map-selection-icon"><img src="/world.png" alt="World" /></div>
                <h2 className="map-selection-title">Select Region</h2>
                <p className="map-selection-subtitle">Choose a region to manage registered land parcels</p>
              </div>
              <div className="selection-option-list">
                <button className="selection-option-btn" onClick={() => navigate('/manage/India')} autoFocus>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <img src="/india-flag.png" alt="India" className="selection-option-img" />
                    <span style={{ fontWeight: '600' }}>India</span>
                  </span>
                  <ChevronRight size={18} style={{ color: 'var(--color-primary)' }} />
                </button>
                <button className="selection-option-btn" onClick={() => navigate('/manage/Overseas')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <img src="/globe-small.png" alt="Overseas" className="selection-option-img" />
                    <span style={{ fontWeight: '600' }}>Overseas</span>
                  </span>
                  <ChevronRight size={18} style={{ color: 'var(--color-primary)' }} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 1: Select State ────────────────────────────────────── */}
        {activeStep === 1 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 'calc(100vh - 160px)' }}>
            <div className="map-selection-card" style={{ width: '100%', maxWidth: '440px', margin: '0 auto' }}>
              <div className="map-selection-header">
                <div className="map-selection-icon"><img src="/india.png" alt="India" /></div>
                <h2 className="map-selection-title">Select State</h2>
                <p className="map-selection-subtitle">India • Choose state to view district boundaries</p>
              </div>
              <div className="selection-dropdown-wrapper">
                <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>State</label>
                {states.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No states available.</p>
                ) : (
                  <select className="selection-select" value={selectedStateId} onChange={e => setSelectedStateId(e.target.value)}>
                    {states.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }} onClick={handleStateContinue} disabled={!selectedStateId || loadingStep}>
                {loadingStep ? 'Loading...' : 'Continue to District →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Select District ─────────────────────────────────── */}
        {activeStep === 2 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 'calc(100vh - 160px)' }}>
            <div className="map-selection-card" style={{ width: '100%', maxWidth: '440px', margin: '0 auto' }}>
              <div className="map-selection-header">
                <div className="map-selection-icon"><img src="/tamil-nadu.png" alt="District" /></div>
                <h2 className="map-selection-title">Select District</h2>
                <p className="map-selection-subtitle">{stateNode?.name || fromSlug(segments[1])} • Choose district to view its taluks</p>
              </div>
              <div className="selection-dropdown-wrapper">
                <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>District</label>
                {districts.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No districts available.</p>
                ) : (
                  <select className="selection-select" value={selectedDistrictId} onChange={e => setSelectedDistrictId(e.target.value)}>
                    {districts.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }} onClick={handleDistrictContinue} disabled={!selectedDistrictId || loadingStep}>
                {loadingStep ? 'Loading...' : 'Continue to Taluk →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Select Taluk ────────────────────────────────────── */}
        {activeStep === 3 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 'calc(100vh - 160px)' }}>
            <div className="map-selection-card" style={{ width: '100%', maxWidth: '440px', margin: '0 auto' }}>
              <div className="map-selection-header">
                <div className="map-selection-icon"><img src="/tamil-nadu.png" alt="Taluk" /></div>
                <h2 className="map-selection-title">Select Taluk</h2>
                <p className="map-selection-subtitle">{districtNode?.name || fromSlug(segments[2])} • Choose taluk to manage records</p>
              </div>
              <div className="selection-dropdown-wrapper">
                <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>Taluk</label>
                {taluks.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No taluks available.</p>
                ) : (
                  <select className="selection-select" value={selectedTalukId} onChange={e => setSelectedTalukId(e.target.value)}>
                    {taluks.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }} onClick={handleTalukContinue} disabled={!selectedTalukId || taluks.length === 0 || loadingStep}>
                {loadingStep ? 'Loading...' : 'Continue to Village →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Select Village Card ─────────────────────────────── */}
        {activeStep === 4 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 'calc(100vh - 160px)' }}>
            <div className="map-selection-card" style={{ width: '100%', maxWidth: '440px', margin: '0 auto' }}>
              <div className="map-selection-header">
                <div className="map-selection-icon"><img src="/tamil-nadu.png" alt="Village" /></div>
                <h2 className="map-selection-title">Select Village</h2>
                <p className="map-selection-subtitle">{talukNode?.name || fromSlug(segments[3])} • Choose village to manage records</p>
              </div>
              <div className="selection-dropdown-wrapper">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0, fontWeight: '600' }}>Village</label>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ padding: '0.25rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderRadius: '6px' }}
                    onClick={() => { setShowAddVillage(true); setAddVillageError(''); setNewVillageName('') }}
                  >
                    <Plus size={13} /> Add Village
                  </button>
                </div>
                {villages.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No villages available in this taluk.</p>
                ) : (
                  <select className="selection-select" value={selectedVillageChoiceId} onChange={e => setSelectedVillageChoiceId(e.target.value)}>
                    {villages.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }}
                onClick={handleVillageContinue}
                disabled={villages.length === 0 || !selectedVillageChoiceId || loadingStep}
              >
                {loadingStep ? 'Loading...' : 'Continue to Village Parcels →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 10: Select Overseas Country ────────────────────────── */}
        {activeStep === 10 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 'calc(100vh - 160px)' }}>
            <div className="map-selection-card" style={{ width: '100%', maxWidth: '440px', margin: '0 auto' }}>
              <div className="map-selection-header">
                <div className="map-selection-icon"><img src="/world.png" alt="Overseas" /></div>
                <h2 className="map-selection-title">Select Country</h2>
                <p className="map-selection-subtitle">Choose overseas country to update records</p>
              </div>
              <div className="selection-dropdown-wrapper">
                <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>Country</label>
                {countries.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No countries available.</p>
                ) : (
                  <select className="selection-select" value={selectedOverseasId} onChange={e => setSelectedOverseasId(e.target.value)}>
                    {countries.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }}
                onClick={handleOverseasContinue}
                disabled={!selectedOverseasId || loadingStep}
              >
                {loadingStep ? 'Loading...' : 'Continue to Country Parcels →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Parcel List View (after village selected) ──────────────────── */}
        {(activeStep === 5 || activeStep === 11) && selectedVillage && (
          <>
            {/* Page Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h1
                  style={{
                    fontSize: '1.8rem',
                    fontWeight: '800',
                    color: '#ffffff',
                    textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
                    letterSpacing: '-0.02em',
                    margin: 0
                  }}
                >
                  {selectedVillage.name} — Land Parcels
                </h1>
                <p style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', marginTop: '0.35rem', fontWeight: '500' }}>
                  Manage registered land parcels and records
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                {activeStep !== 11 && segments[0]?.toLowerCase() !== 'overseas' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        borderColor: 'rgba(255, 255, 255, 0.8)',
                        color: '#0f172a',
                        padding: '0.75rem 1.15rem',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        borderRadius: '10px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }}
                      onClick={() => startRename(selectedVillage)}
                    >
                      <Pencil size={15} /> Edit Village
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{
                        background: 'rgba(254, 242, 242, 0.95)',
                        borderColor: '#fca5a5',
                        color: '#dc2626',
                        padding: '0.75rem 1.15rem',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        borderRadius: '10px',
                        boxShadow: '0 2px 8px rgba(220, 38, 38, 0.1)'
                      }}
                      onClick={() => setDeleteVillageConfirm(selectedVillage)}
                    >
                      <Trash2 size={15} /> Delete Village
                    </button>
                  </>
                )}

                <button
                  id="btn-add-parcel"
                  className="btn btn-primary"
                  style={{
                    padding: '0.75rem 1.25rem',
                    fontSize: '0.925rem',
                    fontWeight: '600',
                    boxShadow: '0 4px 16px rgba(37, 99, 235, 0.45)',
                    borderRadius: '10px'
                  }}
                  onClick={handleAddNewParcel}
                >
                  + Add New Parcel
                </button>
              </div>
            </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Parcels Table */}
        {loading ? (
          <div className="loading-center" style={{ padding: '4rem', color: '#ffffff' }}><span className="spinner" /></div>
        ) : plots.length === 0 ? (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.35)',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              padding: '3.5rem 2rem'
            }}
          >
            <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#0f172a' }}>No parcels registered yet.</p>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: '#64748b' }}>
              Click <strong style={{ color: 'var(--color-primary)' }}>+ Add New Parcel</strong> to add your first spatial plot.
            </p>
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.5)',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.3)',
              overflow: 'hidden'
            }}
          >
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '0.85rem 1.25rem', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>Land ID</th>
                  <th style={{ padding: '0.85rem 1.25rem', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>Name</th>
                  <th style={{ padding: '0.85rem 1.25rem', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>Area</th>
                  <th style={{ padding: '0.85rem 1.25rem', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>Location</th>
                  <th style={{ padding: '0.85rem 1.25rem', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>Docs</th>
                  <th style={{ padding: '0.85rem 1.25rem', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plots.map(plot => (
                  <tr key={plot.id} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.15s ease' }}>
                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <span className="badge badge-blue" style={{ fontWeight: '600', fontSize: '0.8rem' }}>{plot.plot_number || '—'}</span>
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', fontWeight: '600', color: '#0f172a' }}>{plot.property_name || '—'}</td>
                    <td style={{ padding: '0.9rem 1.25rem', color: '#475569', fontWeight: '500' }}>
                      {plot.area_value
                        ? `${Number(plot.area_value).toLocaleString()} ${plot.area_unit}`
                        : '—'}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', color: '#64748b', fontSize: '0.85rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {plot.location_name || (plot.lat && plot.lon ? `${plot.lat.toFixed(4)}, ${plot.lon.toFixed(4)}` : '—')}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      {plot.documents && plot.documents.length > 0
                        ? <span className="badge badge-green" style={{ fontWeight: '600' }}>{plot.documents.length} docs</span>
                        : <span className="badge badge-gray">None</span>}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ fontWeight: '600', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                          onClick={() => openParcelModal(plot)}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ fontWeight: '600', borderRadius: '6px' }}
                          onClick={() => setDeleteConfirm(plot.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </>
        )}

        {/* Add Parcel Modal */}
        {showForm && (
          <div className="modal-overlay" onClick={closeParcelModal}>
            <div className="modal modal-large" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">{editingPlotId ? `Edit Parcel — ${form.land_id || 'Parcel'}` : 'Add New Parcel'}</span>
                <button className="btn-outline" style={{ border: 'none', padding: '0.2rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={closeParcelModal}>
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
                        {editingPlotId && (
                          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.65rem 0.85rem', marginBottom: '0.85rem', fontSize: '0.825rem', color: '#166534' }}>
                            ℹ️ <strong>Current Boundary Active:</strong> Upload a new KML/KMZ only if you wish to replace the existing spatial boundary polygon.
                          </div>
                        )}
                        <label className="form-label" style={{ fontWeight: '700', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Upload size={16} /> Upload KML File {editingPlotId ? '(Optional replacement)' : '*'}
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
                          <option value="land_official_details">Land Official Details</option>
                          <option value="buildup_details">Build-up Details</option>
                          <option value="source_files">Source Files</option>
                        </select>
                      </div>

                      {/* Selected Subcategory Document Upload Fields */}
                      <div className="doc-section">
                        {docSubcategory === 'land_documents' && (
                          <div>
                            <h4 className="doc-section-title">Land Documents</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <FileField label="Deed Document" accept=".pdf" onChange={setDeedFile} files={deedFile} />
                              <FileField label="Parent Document" accept=".pdf" onChange={setParentDocumentFile} files={parentDocumentFile} />
                              <FileField label="TSLR Sketch" accept=".pdf" onChange={setFmbFile} files={fmbFile} />
                              <FileField label="Patta / Chitta Details" accept=".pdf" onChange={setPattaFile} files={pattaFile} />
                              <FileField label="EC Details" accept=".pdf" onChange={setEcDetailsFile} files={ecDetailsFile} />
                              <FileField label="Adangal" accept=".pdf" onChange={setAdangalFile} files={adangalFile} />
                              <FileField label="A-Register" accept=".pdf" onChange={setARegisterFile} files={aRegisterFile} />
                            </div>
                          </div>
                        )}

                        {(docSubcategory === 'land_official_details' || docSubcategory === 'others') && (
                          <div>
                            <h4 className="doc-section-title">Land Official Details</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <FileField label="Property Tax" accept=".pdf" onChange={setPropertyTaxFile} files={propertyTaxFile} />
                              <FileField label="Aerial/Field Photos" accept=".pdf" onChange={setAerialPhotoFile} files={aerialPhotoFile} />
                              <FileField label="Dispute Details" accept=".pdf" onChange={setDisputeDetailsFile} files={disputeDetailsFile} />
                              <FileField label="Approved Industry / Residential Plan" accept=".pdf" onChange={setApprovedPlanFile} files={approvedPlanFile} />
                            </div>
                          </div>
                        )}

                        {docSubcategory === 'buildup_details' && (
                          <div>
                            <h4 className="doc-section-title">Build-up Details</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <FileField label="Building Plan" accept=".pdf" onChange={setBuildingPlanFile} files={buildingPlanFile} />
                              <FileField label="Plan Approval Letter" accept=".pdf" onChange={setPlanApprovalLetterFile} files={planApprovalLetterFile} />
                              <FileField label="Building Permit Letter" accept=".pdf" onChange={setBuildingPermitLetterFile} files={buildingPermitLetterFile} />
                            </div>
                          </div>
                        )}

                        {docSubcategory === 'source_files' && (
                          <div>
                            <h4 className="doc-section-title">Source Files</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <FileField label="KML File" accept=".kml,.kmz" onChange={setSourceKmlFile} files={sourceKmlFile} />
                              <FileField label="Shapefile (Compressed)" accept=".zip,.tar,.gz,.tar.gz,.tgz,.rar,.7z" onChange={setShapefileFile} files={shapefileFile} />
                            </div>
                          </div>
                        )}

                        {/* If editing, show existing documents for this category */}
                        {editingPlotId && (() => {
                          const catDocs = existingDocs.filter(d => DOC_CATEGORIES[docSubcategory]?.includes(d.doc_type))
                          if (catDocs.length === 0) return null
                          return (
                            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                              <label className="form-label" style={{ fontWeight: '700', fontSize: '0.8rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'block' }}>
                                Currently Uploaded ({catDocs.length})
                              </label>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                {catDocs.map(doc => {
                                  const parts = doc.storage_key.split('/')
                                  const rawName = parts[parts.length - 1]
                                  const cleanName = rawName.replace(new RegExp(`^${doc.doc_type}_\\d+_`), '')
                                  return (
                                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                        <FileText size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ fontSize: '0.825rem', fontWeight: '600', color: '#1e293b' }}>
                                            {DOC_TITLES[doc.doc_type] || doc.doc_type}
                                          </div>
                                          <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cleanName}>
                                            {cleanName}
                                          </div>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline"
                                        style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '0.2rem 0.45rem', fontSize: '0.725rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}
                                        onClick={() => handleDeleteExistingDoc(doc.id)}
                                        disabled={deletingDocId === doc.id}
                                        title="Delete document"
                                      >
                                        <Trash2 size={12} /> {deletingDocId === doc.id ? 'Deleting...' : 'Delete'}
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline" onClick={closeParcelModal} disabled={submitting}>Cancel</button>
                  
                  {submitting ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '200px' }}>
                      <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.3s ease' }} />
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text)' }}>{uploadProgress}%</span>
                    </div>
                  ) : (
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={editingPlotId ? (!form.land_id || !form.land_name) : (!form.land_id || !form.land_name || !kmlFile)}
                    >
                      {editingPlotId ? 'Save Changes' : 'Create Parcel'}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Parcel Confirm Modal */}
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

        {/* Add Village Modal */}
        {showAddVillage && (
          <div className="modal-overlay" onClick={() => setShowAddVillage(false)}>
            <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">Add Village</span>
                <button className="btn-outline" style={{ border: 'none', padding: '0.2rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowAddVillage(false)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                {addVillageError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{addVillageError}</div>}
                <div className="form-group">
                  <label className="form-label">Village Name *</label>
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
                  {addVillageLoading ? 'Creating...' : 'Create Village'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rename Village Modal */}
        {renameVillageId && (
          <div className="modal-overlay" onClick={() => setRenameVillageId(null)}>
            <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">Edit Village Name</span>
                <button className="btn-outline" style={{ border: 'none', padding: '0.2rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setRenameVillageId(null)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                {renameError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{renameError}</div>}
                <div className="form-group">
                  <label className="form-label">Village Name *</label>
                  <input
                    className="form-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameVillage() }}
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setRenameVillageId(null)} disabled={renameLoading}>Cancel</button>
                <button className="btn btn-primary" onClick={handleRenameVillage} disabled={!renameValue.trim() || renameLoading}>
                  {renameLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Village Confirm Modal */}
        {deleteVillageConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteVillageConfirm(null)}>
            <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header"><span className="modal-title">Delete Village</span></div>
              <div className="modal-body">
                <p>Delete <strong>{deleteVillageConfirm.name}</strong>? This will permanently delete all parcels and their documents in this village.</p>
                <p style={{ color: '#dc2626', fontWeight: '600', marginTop: '0.5rem', fontSize: '0.875rem' }}>This action cannot be undone.</p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setDeleteVillageConfirm(null)} disabled={deletingVillage}>Cancel</button>
                <button className="btn btn-danger" onClick={() => handleDeleteVillage(deleteVillageConfirm)} disabled={deletingVillage}>
                  {deletingVillage ? 'Deleting...' : 'Delete Village'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
