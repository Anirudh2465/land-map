/**
 * MapPage — satellite map showing land parcel polygons for a district.
 * Route: /map/:districtId
 *
 * Features:
 *  - Leaflet map with Esri World Imagery (satellite) tiles
 *  - All ACTIVE parcels rendered as GeoJSON polygons
 *  - Zoom-based labels: plot_number at zoom ≥ 14, property_name at zoom ≥ 16
 *  - Click a parcel → map pans to fit bounds → left info panel opens
 *  - Info panel: Details, Geography, Documents (Preview & Download)
 *  - PDF preview via iframe in a modal using presigned URLs
 */
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getPlots, getPlot } from '../api/plots'
import { getDocumentUrl } from '../api/documents'
import { getNodeByName, getCountries, getChildren } from '../api/geo'
import { geocodeAddress, getRoute, getNearbyPlaces } from '../api/routing'
import Header from '../components/Header'
import { Search, ChevronDown, ChevronUp, X, FileText, Download, Eye, ChevronRight, MapPin, Navigation, ArrowLeftRight, Map as MapIcon, Clock, Car, Bike, Footprints } from 'lucide-react'

// Unit conversion constants
const AREA_UNITS = ['sqm', 'sqft', 'acres', 'hectares']
const UNIT_CONVERSION = {
  sqm: 1,
  sqft: 10.7639104,
  acres: 0.000247105,
  hectares: 0.0001
}

function convertAreaValue(val, fromUnit, toUnit) {
  if (val === null || val === undefined || val === '' || isNaN(val)) return '—'
  const numInSqm = parseFloat(val) / (UNIT_CONVERSION[fromUnit || 'sqm'] || 1)
  const converted = numInSqm * (UNIT_CONVERSION[toUnit] || 1)
  return Number.isInteger(converted) ? converted.toLocaleString() : parseFloat(converted.toFixed(4)).toLocaleString()
}

const DOC_CATEGORIES = {
  land_documents: ['DEED', 'PARENT_DOCUMENT', 'FMB', 'PATTA', 'EC_DETAILS'],
  buildup_details: ['BUILDING_PLAN', 'PLAN_APPROVAL', 'BUILDING_PERMIT'],
  others: ['PROPERTY_TAX', 'AERIAL_PHOTO', 'DISPUTE_DETAILS']
}

// Coordinates and view constants
const WORLD_VIEW = { center: [20, 20], zoom: 3.5 }
const INDIA_VIEW = { center: [22.5, 79.5], zoom: 5.5 }
const TN_VIEW = { center: [11.12, 78.65], zoom: 7.8 }

// Coimbatore district approximate bounds [SW, NE]
const CBE_BOUNDS = L.latLngBounds(
  L.latLng(10.85, 76.85),
  L.latLng(11.25, 77.25)
)

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

const PARCEL_STYLE = {
  color: '#2563eb',
  weight: 2,
  opacity: 0.9,
  fillColor: '#3b82f6',
  fillOpacity: 0.25,
}

const PARCEL_HOVER_STYLE = {
  color: '#1d4ed8',
  weight: 3,
  fillOpacity: 0.45,
}

const PARCEL_SELECTED_STYLE = {
  color: '#dc2626',
  weight: 3,
  fillColor: '#ef4444',
  fillOpacity: 0.35,
}

export default function MapPage() {
  const { districtId } = useParams()
  const navigate = useNavigate()

  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const labelsLayerRef = useRef(null)
  const layersRef = useRef([]) // { layer, plot, labelMarker }
  const selectedLayerRef = useRef(null)

  const [plots, setPlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPlot, setSelectedPlot] = useState(null)
  const [pdfModal, setPdfModal] = useState(null) // { url, docType }
  const [pdfLoading, setPdfLoading] = useState(false)

  // Selection flow states
  const [currentStep, setCurrentStep] = useState(districtId ? 'READY' : 'REGION')
  const [isBlurOverlayVisible, setIsBlurOverlayVisible] = useState(!districtId)
  const [selectedState, setSelectedState] = useState('Tamil Nadu')
  const [selectedDistrict, setSelectedDistrict] = useState('Coimbatore')
  const [activeDistrictId, setActiveDistrictId] = useState(districtId || null)

  const [countries, setCountries] = useState([])
  const [states, setStates] = useState([])
  const [districts, setDistricts] = useState([])
  const [indiaNode, setIndiaNode] = useState(null)
  const [tnNode, setTnNode] = useState(null)

  // Floating Search & Side Panel Control States
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [panelAreaUnit, setPanelAreaUnit] = useState('sqm')
  const [addressViewMode, setAddressViewMode] = useState('db')
  const [panelDocCategory, setPanelDocCategory] = useState('land_documents')

  // Routing & Nearby state
  const [activePanelTab, setActivePanelTab] = useState('details') // 'details' | 'directions' | 'nearby'
  
  const [dirFrom, setDirFrom] = useState('')
  const [dirTo, setDirTo] = useState('Plot')
  const [isDirToPlot, setIsDirToPlot] = useState(true)
  const [routeData, setRouteData] = useState(null)
  const [isRouting, setIsRouting] = useState(false)
  const [travelMode, setTravelMode] = useState('driving')
  const [routeError, setRouteError] = useState('')
  const routeLayerRef = useRef(null)

  const [geocodeResults, setGeocodeResults] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [selectedDestCoords, setSelectedDestCoords] = useState(null)

  const [nearbyCategory, setNearbyCategory] = useState('')
  const [nearbyPlaces, setNearbyPlaces] = useState([])
  const [isFetchingNearby, setIsFetchingNearby] = useState(false)
  const [nearbyError, setNearbyError] = useState('')
  const [expandedNearbyPlaceId, setExpandedNearbyPlaceId] = useState(null)
  const [nearbyRadius, setNearbyRadius] = useState(2000)
  const nearbyLayerRef = useRef(null)

  const clearRouteAndNearby = () => {
    if (routeLayerRef.current) {
      mapInstanceRef.current?.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }
    if (nearbyLayerRef.current) {
      mapInstanceRef.current?.removeLayer(nearbyLayerRef.current)
      nearbyLayerRef.current = null
    }
    setRouteData(null)
    setNearbyPlaces([])
    setNearbyCategory('')
    setDirFrom('')
  }

  useEffect(() => {
    if (mapInstanceRef.current) {
      if (activePanelTab === 'directions') {
        if (routeLayerRef.current && !mapInstanceRef.current.hasLayer(routeLayerRef.current)) {
          routeLayerRef.current.addTo(mapInstanceRef.current)
        }
        if (nearbyLayerRef.current && mapInstanceRef.current.hasLayer(nearbyLayerRef.current)) {
          nearbyLayerRef.current.removeFrom(mapInstanceRef.current)
        }
      } else if (activePanelTab === 'nearby') {
        if (routeLayerRef.current && mapInstanceRef.current.hasLayer(routeLayerRef.current)) {
          routeLayerRef.current.removeFrom(mapInstanceRef.current)
        }
        if (nearbyLayerRef.current && !mapInstanceRef.current.hasLayer(nearbyLayerRef.current)) {
          nearbyLayerRef.current.addTo(mapInstanceRef.current)
        }
      } else {
        if (routeLayerRef.current && mapInstanceRef.current.hasLayer(routeLayerRef.current)) {
          routeLayerRef.current.removeFrom(mapInstanceRef.current)
        }
        if (nearbyLayerRef.current && mapInstanceRef.current.hasLayer(nearbyLayerRef.current)) {
          nearbyLayerRef.current.removeFrom(mapInstanceRef.current)
        }
      }
    }
  }, [activePanelTab])

  const handleClickNearbyPlace = (el) => {
    if (!mapInstanceRef.current) return
    mapInstanceRef.current.setView([el.lat, el.lon], 16)
    
    if (expandedNearbyPlaceId === el.id) {
      setExpandedNearbyPlaceId(null)
    } else {
      setExpandedNearbyPlaceId(el.id)
    }

    if (nearbyLayerRef.current) {
      nearbyLayerRef.current.eachLayer(layer => {
        if (layer.getLatLng && typeof layer.getLatLng === 'function') {
          const latlng = layer.getLatLng()
          if (latlng.lat === el.lat && latlng.lng === el.lon) {
            layer.openPopup()
          }
        }
      })
    }
  }

  const handleRouteToNearby = (el) => {
    const placeName = el.tags?.name || "Selected Place"
    setDirFrom(placeName)
    setIsDirToPlot(false)
    setSelectedDestCoords({ lat: el.lat, lng: el.lon })
    setActivePanelTab('directions')
    
    handleFetchRoute({
      isDirToPlot: false,
      dirFrom: placeName,
      coords: { lat: el.lat, lng: el.lon }
    })
  }

  const handleAddressInputChange = (e) => {
    const val = e.target.value
    setDirFrom(val)
    setSelectedDestCoords(null)
    
    if (!val.trim()) {
      setGeocodeResults([])
      setShowSuggestions(false)
      return
    }
    
    if (window.geocodeTimeout) clearTimeout(window.geocodeTimeout)
    window.geocodeTimeout = setTimeout(async () => {
      setIsGeocoding(true)
      try {
        const res = await geocodeAddress(val, selectedPlot?.lat, selectedPlot?.lon)
        let results = res || []
        
        if (results.length > 0 && selectedPlot && selectedPlot.lat != null && selectedPlot.lon != null) {
          const plotLL = L.latLng(selectedPlot.lat, selectedPlot.lon)
          results.forEach(item => {
             item.distanceToPlot = L.latLng(parseFloat(item.lat), parseFloat(item.lon)).distanceTo(plotLL)
          })
          results.sort((a, b) => a.distanceToPlot - b.distanceToPlot)
        }
        
        setGeocodeResults(results)
        setShowSuggestions(true)
      } catch (err) {
        console.error("Geocode error", err)
      } finally {
        setIsGeocoding(false)
      }
    }, 600)
  }

  const handleSelectSuggestion = (item) => {
    setDirFrom(item.display_name)
    setSelectedDestCoords({ lat: parseFloat(item.lat), lng: parseFloat(item.lon) })
    setShowSuggestions(false)
  }


  // ── Init Map ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInstanceRef.current) return // Already initialized

    const initialCenter = districtId ? CBE_BOUNDS.getCenter() : WORLD_VIEW.center
    const initialZoom = districtId ? 11 : WORLD_VIEW.zoom

    const map = L.map(mapRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 3.5,
      maxZoom: 22,
      zoomControl: true,
    })

    // 1. Low-res fallback layer (loads state/district level tiles and scales them up)
    // This perfectly matches the user's idea of "loading the state" but uses low-res
    // tiles so the browser doesn't crash. It prevents the map from blacking out during flyTo.
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxNativeZoom: 10, // Locks tile requests to a low zoom (covers large areas)
        maxZoom: 22,
      }
    ).addTo(map)

    // 2. High-res detail layer (loads specific high-res tiles where the user is)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles © Esri',
        maxNativeZoom: 18,
        maxZoom: 22,
        keepBuffer: 4, // Pre-loads a larger ring of tiles around the view
      }
    ).addTo(map)

    // Esri World Boundaries and Places (labels + roads)
    const labelsLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        maxNativeZoom: 18,
        maxZoom: 22,
      }
    )
    labelsLayerRef.current = labelsLayer

    // Only fit bounds if already in READY step on initial load
    if (districtId) {
      map.fitBounds(CBE_BOUNDS, { padding: [20, 20] })
    }

    mapInstanceRef.current = map

    // Cleanup on unmount
    return () => {
      map.remove()
      mapInstanceRef.current = null
      labelsLayerRef.current = null
    }
  }, [districtId])

  // ── Dynamic Visibility of KML Parcels & Places/Labels Layer ─────────────
  useEffect(() => {
    const map = mapInstanceRef.current
    const labelsLayer = labelsLayerRef.current
    if (!map) return

    if (currentStep === 'READY') {
      // Show reference labels & boundaries
      if (labelsLayer && !map.hasLayer(labelsLayer)) {
        labelsLayer.addTo(map)
      }
      // Show parcel GeoJSON polygons
      layersRef.current.forEach(({ layer }) => {
        if (!map.hasLayer(layer)) {
          layer.addTo(map)
        }
      })
    } else {
      // Hide reference labels & boundaries
      if (labelsLayer && map.hasLayer(labelsLayer)) {
        map.removeLayer(labelsLayer)
      }
      // Hide parcel GeoJSON polygons & label markers
      layersRef.current.forEach(({ layer, labelMarker }) => {
        if (map.hasLayer(layer)) {
          map.removeLayer(layer)
        }
        if (labelMarker && map.hasLayer(labelMarker)) {
          map.removeLayer(labelMarker)
        }
      })
    }
  }, [currentStep, plots])

  // ── Plot Selection ─────────────────────────────────────────────────────
  const selectPlot = (plot) => {
    setSelectedPlot(plot)
    setActivePanelTab('details')
    clearRouteAndNearby()
    setAddressViewMode('db')
    setPanelAreaUnit('sqm')
    setPanelDocCategory('land_documents')
    setIsSearchOpen(false)
  }

  // ── Load Plots ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeDistrictId) return
    setLoading(true)
    getPlots(activeDistrictId)
      .then(setPlots)
      .catch(err => setError(err.response?.data?.detail || 'Failed to load parcels.'))
      .finally(() => setLoading(false))
  }, [activeDistrictId])

  // ── Load Geo Nodes for Counts ──────────────────────────────────────
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

  // ── Flow Handlers ───────────────────────────────────────────────────
  async function handleSelectIndia() {
    const node = await getNodeByName('COUNTRY', 'India').catch(() => null)
    setIndiaNode(node)
    setIsBlurOverlayVisible(false)
    setCurrentStep('PANNING_INDIA')
    const map = mapInstanceRef.current
    if (map) {
      map.flyTo(INDIA_VIEW.center, INDIA_VIEW.zoom, { duration: 1.0, easeLinearity: 0.25 })
      const timer = setTimeout(() => {
        setCurrentStep('STATE')
        setIsBlurOverlayVisible(true)
      }, 1050)
      map.once('moveend', () => {
        clearTimeout(timer)
        setCurrentStep('STATE')
        setIsBlurOverlayVisible(true)
      })
    }
  }

  async function handleSelectTamilNadu() {
    const node = await getNodeByName('STATE', 'Tamil Nadu').catch(() => null)
    setTnNode(node)
    setIsBlurOverlayVisible(false)
    setCurrentStep('PANNING_TN')
    const map = mapInstanceRef.current
    if (map) {
      map.flyTo(TN_VIEW.center, TN_VIEW.zoom, { duration: 1.0, easeLinearity: 0.25 })
      const timer = setTimeout(() => {
        setCurrentStep('DISTRICT')
        setIsBlurOverlayVisible(true)
      }, 1050)
      map.once('moveend', () => {
        clearTimeout(timer)
        setCurrentStep('DISTRICT')
        setIsBlurOverlayVisible(true)
      })
    }
  }

  async function handleSelectCoimbatore() {
    setIsBlurOverlayVisible(false)
    setCurrentStep('PANNING_CBE')
    const map = mapInstanceRef.current
    if (map) {
      map.flyTo(CBE_BOUNDS.getCenter(), 11, { duration: 1.0, easeLinearity: 0.25 })
    }

    try {
      let targetId = activeDistrictId
      if (!targetId) {
        const node = await getNodeByName('DISTRICT', 'Coimbatore')
        if (node) {
          targetId = node.id
          setActiveDistrictId(node.id)
        }
      } else {
        if (plots.length === 0) {
          setLoading(true)
          getPlots(targetId)
            .then(setPlots)
            .catch(err => setError(err.response?.data?.detail || 'Failed to load parcels.'))
            .finally(() => setLoading(false))
        }
      }
    } catch (e) {
      console.error('Error fetching Coimbatore node:', e)
    }

    const timer = setTimeout(() => {
      setCurrentStep('READY')
      if (map) map.invalidateSize()
    }, 1050)
    if (map) {
      map.once('moveend', () => {
        clearTimeout(timer)
        setCurrentStep('READY')
        map.invalidateSize()
      })
    }
  }

  function handleBack() {
    if (selectedPlot) {
      handleClosePanel()
      return
    }

    const map = mapInstanceRef.current

    if (currentStep === 'READY') {
      setPlots([])
      setSelectedPlot(null)
      setActiveDistrictId(null)
      setCurrentStep('DISTRICT')
      setIsBlurOverlayVisible(true)
      if (map) {
        map.flyTo(TN_VIEW.center, TN_VIEW.zoom, { duration: 1.0 })
      }
      return
    }

    if (currentStep === 'DISTRICT') {
      setCurrentStep('STATE')
      setIsBlurOverlayVisible(true)
      if (map) {
        map.flyTo(INDIA_VIEW.center, INDIA_VIEW.zoom, { duration: 1.0 })
      }
      return
    }

    if (currentStep === 'STATE') {
      setCurrentStep('REGION')
      setIsBlurOverlayVisible(true)
      if (map) {
        map.flyTo(WORLD_VIEW.center, WORLD_VIEW.zoom, { duration: 1.0 })
      }
      return
    }

    if (currentStep === 'REGION') {
      navigate('/')
      return
    }

    navigate('/')
  }

  const getHeaderCenter = () => {
    if (currentStep === 'READY') {
      const parcelCount = plots.filter(p => p.boundary_geojson).length
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span className="header-center-title">
            Coimbatore District — Land Parcels
          </span>
          {loading ? (
            <span className="spinner" />
          ) : (
            <span className="badge badge-blue">
              {parcelCount} {parcelCount === 1 ? 'parcel' : 'parcels'}
            </span>
          )}
        </div>
      )
    }

    if (currentStep === 'DISTRICT' || currentStep === 'PANNING_CBE') {
      return (
        <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Tamil Nadu › Select District
        </span>
      )
    }

    if (currentStep === 'STATE' || currentStep === 'PANNING_TN') {
      return (
        <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          India › Select State
        </span>
      )
    }

    return (
      <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
        Select Region
      </span>
    )
  }

  // ── Render Polygons ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || plots.length === 0) return

    // Remove old layers
    layersRef.current.forEach(({ layer, labelMarker }) => {
      map.removeLayer(layer)
      if (labelMarker) map.removeLayer(labelMarker)
    })
    layersRef.current = []

    plots.forEach(plot => {
      if (!plot.boundary_geojson) return

      const geoLayer = L.geoJSON(plot.boundary_geojson, {
        style: PARCEL_STYLE,
      })
      if (currentStep === 'READY') {
        geoLayer.addTo(map)
      }

      // Add popup
      const areaText = plot.area_value ? `${Number(plot.area_value).toLocaleString()} ${plot.area_unit || 'sqm'}` : 'N/A'
      const popupContent = `
        <div style="font-family: inherit; margin: 0; min-width: 150px;">
          <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">${plot.plot_number || 'Parcel'}</h4>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #475569;">${plot.property_name || 'Unnamed'}</p>
          <p style="margin: 0; font-size: 12px; font-weight: 500;">Area: ${areaText}</p>
        </div>
      `
      geoLayer.bindPopup(popupContent, {
        autoPanPaddingBottomRight: [380, 20],
        closeButton: true
      })

      // Compute center for label
      const bounds = geoLayer.getBounds()
      const center = bounds.getCenter()

      // Create a label marker (DivIcon) — toggled by zoom
      const labelMarker = L.marker(center, {
        icon: L.divIcon({
          className: '',
          html: `<div class="parcel-label" data-plotid="${plot.id}">
                   <span class="parcel-id">${plot.plot_number || ''}</span>
                   <span class="parcel-name">${plot.property_name || ''}</span>
                 </div>`,
          iconSize: [120, 40],
          iconAnchor: [60, 20],
        }),
        interactive: false,
      })

      // Event handlers
      geoLayer.on('mouseover', () => {
        if (selectedLayerRef.current?.layer !== geoLayer) {
          geoLayer.setStyle(PARCEL_HOVER_STYLE)
        }
      })
      geoLayer.on('mouseout', () => {
        if (selectedLayerRef.current?.layer !== geoLayer) {
          geoLayer.setStyle(PARCEL_STYLE)
        }
      })
      geoLayer.on('click', () => {
        handleSelectPlot(plot, geoLayer, bounds)
      })

      layersRef.current.push({ layer: geoLayer, labelMarker, plot })
    })

    // Update labels on zoom
    function updateLabels() {
      const zoom = map.getZoom()
      layersRef.current.forEach(({ labelMarker }) => {
        if (currentStep === 'READY' && zoom >= 14) {
          if (!map.hasLayer(labelMarker)) labelMarker.addTo(map)
          // Show/hide name part
          const el = labelMarker.getElement()
          if (el) {
            const nameEl = el.querySelector('.parcel-name')
            if (nameEl) nameEl.style.display = zoom >= 16 ? 'block' : 'none'
          }
        } else {
          if (map.hasLayer(labelMarker)) map.removeLayer(labelMarker)
        }
      })
    }

    map.on('zoomend', updateLabels)
    updateLabels() // initial call

    return () => {
      map.off('zoomend', updateLabels)
    }
  }, [plots, currentStep])

  function handleSelectPlotFromList(plot) {
    const item = layersRef.current.find(l => l.plot.id === plot.id)
    if (!item) return
    handleSelectPlot(plot, item.layer, item.layer.getBounds())
    const layers = item.layer.getLayers()
    if (layers.length > 0) {
      layers[0].openPopup()
    }
  }

  async function handleSelectPlot(plot, geoLayer, bounds) {
    // Reset previous selected
    if (selectedLayerRef.current) {
      selectedLayerRef.current.layer.setStyle(PARCEL_STYLE)
    }

    geoLayer.setStyle(PARCEL_SELECTED_STYLE)
    selectedLayerRef.current = { layer: geoLayer }

    setSelectedPlot(plot)
    setAddressViewMode('db')

    // Wait for React to render the panel and physically resize the map container
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize()
        mapInstanceRef.current.flyTo(bounds.getCenter(), 18, {
          animate: true,
          duration: 1.5
        })
      }
    }, 150)

    // Fetch full detail (with documents)
    try {
      const detail = await getPlot(plot.id)
      setSelectedPlot(detail)
    } catch {
      // Keep the basic list item if detail fetch fails
    }
  }

  function handleClosePanel() {
    setSelectedPlot(null)
    clearRouteAndNearby()
    if (selectedLayerRef.current) {
      selectedLayerRef.current.layer.setStyle(PARCEL_STYLE)
      selectedLayerRef.current = null
    }
  }

  // ── PDF Preview & Download ───────────────────────────────────────────
  async function handlePreviewPdf(doc) {
    try {
      const { url } = await getDocumentUrl(doc.id)
      setPdfModal({ url, docType: doc.doc_type })
    } catch {
      alert('Failed to get document URL.')
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleDownloadPdf(doc) {
    try {
      const { url } = await getDocumentUrl(doc.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      alert('Failed to generate document download link.')
    }
  }

  // ── Routing & Nearby ──────────────────────────────────────────────────
  const handleFetchRoute = async (options = {}) => {
    if (!selectedPlot || selectedPlot.lat == null || selectedPlot.lon == null) return
    const currentIsDirToPlot = options.isDirToPlot !== undefined ? options.isDirToPlot : isDirToPlot
    const inputAddress = options.dirFrom !== undefined ? options.dirFrom : dirFrom
    const currentTravelMode = options.travelMode !== undefined ? options.travelMode : travelMode
    if (!inputAddress.trim()) return
    
    setIsRouting(true)
    setRouteError('')
    try {
      let addrLat, addrLng
      
      if (options.coords) {
        addrLat = options.coords.lat
        addrLng = options.coords.lng
      } else if (selectedDestCoords) {
        addrLat = selectedDestCoords.lat
        addrLng = selectedDestCoords.lng
      } else {
        const geoRes = await geocodeAddress(inputAddress, selectedPlot?.lat, selectedPlot?.lon)
        if (!geoRes || geoRes.length === 0) {
          setRouteError('Could not find that address.')
          setIsRouting(false)
          return
        }
        addrLat = parseFloat(geoRes[0].lat)
        addrLng = parseFloat(geoRes[0].lon)
      }
      
      const pLat = selectedPlot.lat
      const pLng = selectedPlot.lon
      
      const startLat = currentIsDirToPlot ? addrLat : pLat
      const startLng = currentIsDirToPlot ? addrLng : pLng
      const endLat = currentIsDirToPlot ? pLat : addrLat
      const endLng = currentIsDirToPlot ? pLng : addrLng
      
      const routeRes = await getRoute(startLat, startLng, endLat, endLng, currentTravelMode)
      const route = routeRes.routes[0]
      
      // Adjust duration based on travel mode (since public OSRM routes often default to driving times)
      const dist = route.distance // in meters
      if (currentTravelMode === 'foot') {
        route.duration = dist / 1.4 // ~5 km/h
      } else if (currentTravelMode === 'cycling') {
        route.duration = dist / 4.1 // ~15 km/h
      }
      
      setRouteData(route)
      
      if (routeLayerRef.current) {
        mapInstanceRef.current.removeLayer(routeLayerRef.current)
      }
      
      const geojsonLayer = L.geoJSON(route.geometry, {
        style: {
          color: '#ef4444',
          weight: 5,
          opacity: 0.8
        }
      })
      
      const startMarker = L.marker([startLat, startLng], { title: 'Start' })
      const endMarker = L.marker([endLat, endLng], { title: 'End' })
      
      const featureGroup = L.featureGroup([geojsonLayer, startMarker, endMarker])
      featureGroup.addTo(mapInstanceRef.current)
      routeLayerRef.current = featureGroup
      
      mapInstanceRef.current.fitBounds(featureGroup.getBounds(), { padding: [50, 50] })
      
    } catch (err) {
      console.error(err)
      setRouteError('Failed to calculate route.')
    } finally {
      setIsRouting(false)
    }
  }

  const handleFetchNearby = async (category, radiusOverride = null) => {
    if (!selectedPlot || selectedPlot.lat == null || selectedPlot.lon == null) return
    setNearbyCategory(category)
    setNearbyError('')
    setIsFetchingNearby(true)
    const radiusToUse = radiusOverride !== null ? radiusOverride : nearbyRadius
    
    try {
      const res = await getNearbyPlaces(selectedPlot.lat, selectedPlot.lon, radiusToUse, category)
      const elements = res.elements || []
      setNearbyPlaces(elements)
      
      if (nearbyLayerRef.current) {
        mapInstanceRef.current.removeLayer(nearbyLayerRef.current)
        nearbyLayerRef.current = null
      }
      
      if (elements.length > 0) {
        const markers = elements.map(el => {
          let addressStr = ''
          if (el.tags?.['addr:street']) addressStr += el.tags['addr:street']
          if (el.tags?.['addr:city']) addressStr += (addressStr ? ', ' : '') + el.tags['addr:city']
          
          const distTo = L.latLng(el.lat, el.lon).distanceTo(L.latLng(selectedPlot.lat, selectedPlot.lon))
          const distStr = distTo > 1000 ? (distTo / 1000).toFixed(1) + ' km away' : Math.round(distTo) + ' m away'
          
          return L.marker([el.lat, el.lon]).bindPopup(
            `<div style="font-family: inherit;">
              <div style="font-weight: 700; font-size: 14px; margin-bottom: 2px;">${el.tags?.name || 'Unnamed ' + category}</div>
              <div style="font-size: 12px; color: #475569; margin-bottom: 4px;">${category} • ${distStr}</div>
              ${addressStr ? `<div style="font-size: 11px; color: #64748b;">${addressStr}</div>` : ''}
            </div>`
          )
        })
        
        const group = L.featureGroup(markers)
        group.addTo(mapInstanceRef.current)
        nearbyLayerRef.current = group
        
        group.addLayer(L.marker([selectedPlot.lat, selectedPlot.lon]))
        mapInstanceRef.current.fitBounds(group.getBounds(), { padding: [50, 50] })
      }
      
    } catch (err) {
      console.error(err)
      setNearbyError('Failed to fetch nearby places.')
    } finally {
      setIsFetchingNearby(false)
    }
  }

  const filteredPlots = plots.filter(plot => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    const pNum = (plot.plot_number || '').toLowerCase()
    const pName = (plot.property_name || '').toLowerCase()
    return pNum.includes(q) || pName.includes(q)
  })

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header onBack={handleBack} centerContent={getHeaderCenter()} />

      {/* Map + Left Info Panel + Top-Right Floating Search */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>

        {/* Map */}
        <div
          ref={mapRef}
          className={`map-container ${selectedPlot ? 'has-left-panel' : ''}`}
          style={{ flex: 1, height: '100%', background: 'var(--map-bg-color, #0b0f19)' }}
        />

        {/* Top-Right Floating Search Bar */}
        {currentStep === 'READY' && (
          <div className="floating-search-container">
            <div className="floating-search-bar">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search parcel ID or name..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value)
                  if (!isSearchOpen) setIsSearchOpen(true)
                }}
                onFocus={() => setIsSearchOpen(true)}
              />
              {searchQuery && (
                <button className="search-clear-btn" onClick={() => setSearchQuery('')} title="Clear search">
                  <X size={14} />
                </button>
              )}
              <button
                className="search-toggle-btn"
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                title={isSearchOpen ? 'Collapse list' : 'Expand list'}
              >
                {isSearchOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>

            {isSearchOpen && (
              <div className="search-dropdown-menu">
                <div className="search-dropdown-header">
                  <span>Parcels in Region ({filteredPlots.length})</span>
                </div>
                <div className="search-dropdown-list">
                  {filteredPlots.map(plot => {
                    const isSelected = selectedPlot?.id === plot.id
                    return (
                      <div
                        key={plot.id}
                        className={`search-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          handleSelectPlotFromList(plot)
                        }}
                      >
                        <div className="search-item-id">{plot.plot_number || 'Parcel'}</div>
                        <div className="search-item-name">{plot.property_name || 'Unnamed Parcel'}</div>
                      </div>
                    )
                  })}
                  {filteredPlots.length === 0 && (
                    <div className="search-empty">No matching parcels found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Left Side Info Panel */}
        {selectedPlot && (
          <div className="left-info-panel">
            {/* Blue Header Bit */}
            <div style={{
              padding: '1.25rem',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
              color: '#fff',
            }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '1.2rem', letterSpacing: '-0.01em', lineHeight: '1.2' }}>
                  {selectedPlot.plot_number || 'Parcel'}
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '4px', fontWeight: '500', color: '#eff6ff' }}>
                  {selectedPlot.property_name || 'Unnamed Parcel'}
                </div>
              </div>
              <button
                onClick={handleClosePanel}
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s ease'
                }}
                aria-label="Close panel"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tab Bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: '#f8fafc' }}>
              <button 
                onClick={() => setActivePanelTab('details')}
                style={{ flex: 1, padding: '0.75rem', fontWeight: '600', fontSize: '0.85rem', color: activePanelTab === 'details' ? 'var(--color-primary)' : 'var(--color-text-muted)', borderBottom: activePanelTab === 'details' ? '2px solid var(--color-primary)' : '2px solid transparent', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                Details
              </button>
              <button 
                onClick={() => setActivePanelTab('directions')}
                style={{ flex: 1, padding: '0.75rem', fontWeight: '600', fontSize: '0.85rem', color: activePanelTab === 'directions' ? 'var(--color-primary)' : 'var(--color-text-muted)', borderBottom: activePanelTab === 'directions' ? '2px solid var(--color-primary)' : '2px solid transparent', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                Directions
              </button>
              <button 
                onClick={() => setActivePanelTab('nearby')}
                style={{ flex: 1, padding: '0.75rem', fontWeight: '600', fontSize: '0.85rem', color: activePanelTab === 'nearby' ? 'var(--color-primary)' : 'var(--color-text-muted)', borderBottom: activePanelTab === 'nearby' ? '2px solid var(--color-primary)' : '2px solid transparent', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                Nearby
              </button>
            </div>

            {/* Panel Body */}
            <div style={{ padding: '1.25rem', flex: 1, overflowY: 'auto' }}>
              
              {activePanelTab === 'details' && (
                <>
              {/* Section 1: Details */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <InfoRow label="Type" value={selectedPlot.plot_type} />
                <InfoRow label="Year of Registration" value={selectedPlot.year_of_registration} />
                <InfoRow label="Owner Name" value={selectedPlot.owner_name} />

                {/* Address / Map location */}
                <div style={{ marginBottom: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {selectedPlot.address ? (addressViewMode === 'db' ? 'Address' : 'Map location') : 'Map location'}
                    </span>
                    {selectedPlot.address && (
                      <button
                        type="button"
                        onClick={() => setAddressViewMode(v => v === 'db' ? 'map' : 'db')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-primary)',
                          fontSize: '0.725rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline'
                        }}
                      >
                        {addressViewMode === 'db' ? 'Switch to Map location' : 'Switch to Address'}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--color-text)', whiteSpace: 'pre-wrap', lineHeight: '1.45' }}>
                    {selectedPlot.address
                      ? (addressViewMode === 'db' ? selectedPlot.address : (selectedPlot.location_name || '—'))
                      : (selectedPlot.location_name || '—')}
                  </div>
                  {!selectedPlot.address && (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', marginTop: '0.25rem' }}>
                      True address not found
                    </div>
                  )}
                </div>

                <InfoRow label="Landmark" value={selectedPlot.landmark} />
              </div>

              {/* Thin Horizontal Divider Line */}
              <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.1rem 0' }} />

              {/* Section 2: Geography */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '0.85rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.2rem' }}>
                    Coordinates
                  </span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--color-text)', fontWeight: '500' }}>
                    {selectedPlot.lat != null && selectedPlot.lon != null
                      ? `${Math.abs(selectedPlot.lat).toFixed(6)}° ${selectedPlot.lat >= 0 ? 'N' : 'S'}, ${Math.abs(selectedPlot.lon).toFixed(6)}° ${selectedPlot.lon >= 0 ? 'E' : 'W'}`
                      : '—'}
                  </span>
                </div>

                <div style={{ marginBottom: '0.85rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.35rem' }}>
                    Area
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      flex: 1,
                      padding: '0 0.75rem',
                      height: '38px',
                      display: 'flex',
                      alignItems: 'center',
                      background: '#f8fafc',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontWeight: '600',
                      fontSize: '0.9rem',
                      color: '#0f172a'
                    }}>
                      {convertAreaValue(selectedPlot.area_value, selectedPlot.area_unit || 'sqm', panelAreaUnit)}
                    </div>
                    <select
                      className="form-input"
                      style={{
                        width: '105px',
                        flexShrink: 0,
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        padding: '0 0.65rem',
                        height: '38px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        background: '#ffffff'
                      }}
                      value={panelAreaUnit}
                      onChange={e => setPanelAreaUnit(e.target.value)}
                    >
                      {AREA_UNITS.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Thin Horizontal Divider Line */}
              <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.1rem 0' }} />

              {/* Section 3: Documents */}
              <div>
                <div style={{ marginBottom: '0.85rem' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.35rem' }}>
                    Documents Category
                  </label>
                  <select
                    className="form-input"
                    style={{
                      width: '100%',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      padding: '0 0.75rem',
                      height: '38px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      background: '#ffffff'
                    }}
                    value={panelDocCategory}
                    onChange={e => setPanelDocCategory(e.target.value)}
                  >
                    <option value="land_documents">Land Documents</option>
                    <option value="buildup_details">Build-up Details</option>
                    <option value="others">Others</option>
                  </select>
                </div>

                {/* Filtered documents list */}
                {(() => {
                  const allowedTypes = DOC_CATEGORIES[panelDocCategory] || []
                  const categoryDocs = (selectedPlot.documents || []).filter(d => allowedTypes.includes(d.doc_type))

                  if (categoryDocs.length === 0) {
                    return (
                      <div style={{ padding: '0.75rem 0', color: 'var(--color-text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                        No documents in this category.
                      </div>
                    )
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {categoryDocs.map(doc => (
                        <div key={doc.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.55rem 0.75rem',
                          background: '#f8fafc',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                        }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#0f172a' }}>
                            <FileText size={15} style={{ color: 'var(--color-primary)' }} />
                            <span>{doc.doc_type}</span>
                          </span>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handlePreviewPdf(doc)}
                              disabled={pdfLoading}
                              title="Preview PDF"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px' }}
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleDownloadPdf(doc)}
                              title="Download PDF"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px' }}
                            >
                              <Download size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
                </>
              )}

              {/* SECTION 4: Directions */}
              {activePanelTab === 'directions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--color-text)', margin: 0 }}>Get Directions</h3>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <MapPin size={16} color="var(--color-text-muted)" />
                      <input 
                        className="form-input" 
                        value={isDirToPlot ? dirFrom : "Plot"}
                        onChange={handleAddressInputChange}
                        onFocus={() => { if (isDirToPlot && dirFrom) setShowSuggestions(true) }}
                        disabled={!isDirToPlot}
                        placeholder={isDirToPlot ? "Enter origin..." : ""}
                        style={{ flex: 1, padding: '0.4rem 0.75rem', fontSize: '0.85rem', ...(!isDirToPlot ? { background: '#e2e8f0', color: '#475569' } : {}) }}
                      />
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <button 
                        className="btn btn-outline btn-sm" 
                        onClick={() => setIsDirToPlot(!isDirToPlot)}
                        title="Swap Origin and Destination"
                        style={{ padding: '0.2rem', borderRadius: '50%', background: '#fff' }}
                      >
                        <ArrowLeftRight size={14} style={{ transform: 'rotate(90deg)' }} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <MapIcon size={16} color="var(--color-primary)" />
                      <input 
                        className="form-input" 
                        value={!isDirToPlot ? dirFrom : "Plot"}
                        onChange={handleAddressInputChange}
                        onFocus={() => { if (!isDirToPlot && dirFrom) setShowSuggestions(true) }}
                        disabled={isDirToPlot}
                        placeholder={!isDirToPlot ? "Enter destination..." : ""}
                        style={{ flex: 1, padding: '0.4rem 0.75rem', fontSize: '0.85rem', ...(isDirToPlot ? { background: '#e2e8f0', color: '#475569' } : {}) }}
                      />
                    </div>

                    {/* Autocomplete Dropdown */}
                    {showSuggestions && (
                      <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', marginTop: '0.25rem' }}>
                        {isGeocoding ? (
                          <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>Searching...</div>
                        ) : geocodeResults.length > 0 ? (
                          geocodeResults.map((item, idx) => (
                            <div 
                              key={idx} 
                              onClick={() => handleSelectSuggestion(item)}
                              style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', borderBottom: idx < geocodeResults.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
                              onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                              onMouseOut={(e) => e.currentTarget.style.background = '#fff'}
                            >
                              <div style={{ fontWeight: '600', color: 'var(--color-text)', marginBottom: '0.15rem' }}>{item.display_name.split(',')[0]}</div>
                              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.display_name}</div>
                              {item.distanceToPlot != null && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', marginTop: '0.15rem', fontWeight: '500' }}>
                                  {item.distanceToPlot > 1000 ? (item.distanceToPlot / 1000).toFixed(1) + ' km' : Math.round(item.distanceToPlot) + ' m'} away
                                </div>
                              )}
                            </div>
                          ))
                        ) : dirFrom ? (
                          <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>No results found</div>
                        ) : null}
                      </div>
                    )}

                    {/* Travel Mode Selector */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button 
                        className="btn btn-outline btn-sm" 
                        onClick={() => { setTravelMode('driving'); if (dirFrom) handleFetchRoute({ travelMode: 'driving' }) }}
                        style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: travelMode === 'driving' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', background: travelMode === 'driving' ? '#eff6ff' : '#fff', color: travelMode === 'driving' ? 'var(--color-primary)' : 'var(--color-text)' }}
                      >
                        <Car size={16} />
                      </button>
                      <button 
                        className="btn btn-outline btn-sm" 
                        onClick={() => { setTravelMode('cycling'); if (dirFrom) handleFetchRoute({ travelMode: 'cycling' }) }}
                        style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: travelMode === 'cycling' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', background: travelMode === 'cycling' ? '#eff6ff' : '#fff', color: travelMode === 'cycling' ? 'var(--color-primary)' : 'var(--color-text)' }}
                      >
                        <Bike size={16} />
                      </button>
                      <button 
                        className="btn btn-outline btn-sm" 
                        onClick={() => { setTravelMode('foot'); if (dirFrom) handleFetchRoute({ travelMode: 'foot' }) }}
                        style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: travelMode === 'foot' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', background: travelMode === 'foot' ? '#eff6ff' : '#fff', color: travelMode === 'foot' ? 'var(--color-primary)' : 'var(--color-text)' }}
                      >
                        <Footprints size={16} />
                      </button>
                    </div>

                    {routeError && (
                      <div style={{ color: '#ef4444', fontSize: '0.8rem', padding: '0.5rem', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fca5a5' }}>
                        {routeError}
                      </div>
                    )}

                    <button 
                      className="btn btn-primary"
                      onClick={handleFetchRoute}
                      disabled={isRouting}
                      style={{ marginTop: '0.25rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                    >
                      {isRouting ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Navigation size={14} />}
                      {isRouting ? 'Routing...' : 'Show Route'}
                    </button>
                  </div>

                  {/* Route Steps */}
                  {routeData && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', background: '#eff6ff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#1e40af', fontWeight: '600', fontSize: '0.85rem' }}>
                          <Clock size={15} />
                          <span>{Math.round(routeData.duration / 60)} min</span>
                        </div>
                        <div style={{ color: '#1e40af', fontWeight: '600', fontSize: '0.85rem' }}>
                          {(routeData.distance / 1000).toFixed(1)} km
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {routeData.legs?.[0]?.steps?.map((step, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                            <div style={{ width: '24px', display: 'flex', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                              <Navigation size={14} style={{ transform: step.maneuver.modifier?.includes('left') ? 'rotate(-45deg)' : step.maneuver.modifier?.includes('right') ? 'rotate(45deg)' : 'none' }} />
                            </div>
                            <div style={{ flex: 1, fontSize: '0.85rem', color: 'var(--color-text)' }}>
                              {step.maneuver.instruction}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>
                              {step.distance > 1000 ? (step.distance / 1000).toFixed(1) + 'km' : Math.round(step.distance) + 'm'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 5: Nearby Places */}
              {activePanelTab === 'nearby' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--color-text)', margin: 0 }}>Explore Nearby</h3>
                    <select
                      className="form-input"
                      value={nearbyRadius}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10)
                        setNearbyRadius(val)
                        if (nearbyCategory) handleFetchNearby(nearbyCategory, val)
                      }}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 1.5rem 0.25rem 0.5rem', height: 'auto', borderRadius: '6px' }}
                    >
                      <option value={1000}>1 km</option>
                      <option value={2000}>2 km</option>
                      <option value={5000}>5 km</option>
                      <option value={10000}>10 km</option>
                    </select>
                  </div>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {['Hospital', 'School', 'Restaurant', 'Attraction', 'ATM', 'Park', 'Supermarket', 'Pharmacy', 'Cafe', 'Bank'].map(cat => (
                      <button
                        key={cat}
                        className={`btn ${nearbyCategory === cat ? 'btn-primary' : 'btn-outline'} btn-sm`}
                        onClick={() => handleFetchNearby(cat)}
                        disabled={isFetchingNearby}
                        style={{ borderRadius: '20px', fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  
                  {nearbyError && (
                    <div style={{ color: '#ef4444', fontSize: '0.8rem', padding: '0.5rem', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fca5a5' }}>
                      {nearbyError}
                    </div>
                  )}
                  
                  {isFetchingNearby && (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: 'var(--color-primary)', borderRightColor: 'transparent' }} />
                    </div>
                  )}

                  {!isFetchingNearby && nearbyPlaces.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                        Found {nearbyPlaces.length} places (Map updated)
                      </div>
                      {nearbyPlaces.slice(0, 15).map((el, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', background: expandedNearbyPlaceId === el.id ? '#eff6ff' : '#f8fafc', borderRadius: '8px', border: expandedNearbyPlaceId === el.id ? '1px solid #bfdbfe' : '1px solid var(--color-border)', overflow: 'hidden', transition: 'all 0.2s' }}>
                          <div 
                            onClick={() => handleClickNearbyPlace(el)}
                            style={{ padding: '0.65rem 0.75rem', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseOver={(e) => { if (expandedNearbyPlaceId !== el.id) e.currentTarget.style.background = '#f1f5f9' }}
                            onMouseOut={(e) => { if (expandedNearbyPlaceId !== el.id) e.currentTarget.style.background = 'transparent' }}
                          >
                            <div>
                              <div style={{ fontWeight: '600', color: 'var(--color-text)' }}>{el.tags?.name || 'Unnamed ' + nearbyCategory}</div>
                              {el.tags?.amenity && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>{el.tags.amenity}</div>}
                            </div>
                            <ChevronDown size={14} style={{ transform: expandedNearbyPlaceId === el.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--color-text-muted)' }} />
                          </div>
                          
                          {expandedNearbyPlaceId === el.id && (
                            <div style={{ padding: '0 0.75rem 0.75rem 0.75rem', borderTop: '1px solid #dbeafe' }}>
                              <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                                {el.tags?.['addr:street'] ? `${el.tags['addr:street']}${el.tags['addr:city'] ? ', ' + el.tags['addr:city'] : ''}` : 'Address not available'}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '0.5rem', fontWeight: '500' }}>
                                {(() => {
                                  const d = L.latLng(el.lat, el.lon).distanceTo(L.latLng(selectedPlot.lat, selectedPlot.lon))
                                  return d > 1000 ? (d / 1000).toFixed(1) + ' km away' : Math.round(d) + ' m away'
                                })()}
                              </div>
                              <button 
                                onClick={() => handleRouteToNearby(el)}
                                className="btn btn-primary btn-sm" 
                                style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.4rem', padding: '0.35rem' }}
                              >
                                <Navigation size={13} /> Get Directions
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {nearbyPlaces.length > 15 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center', fontStyle: 'italic', marginTop: '0.5rem' }}>
                          + {nearbyPlaces.length - 15} more on map
                        </div>
                      )}
                    </div>
                  )}

                  {!isFetchingNearby && nearbyCategory && nearbyPlaces.length === 0 && (
                     <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                       No {nearbyCategory.toLowerCase()}s found within {nearbyRadius >= 1000 ? nearbyRadius/1000 + 'km' : nearbyRadius + 'm'}.
                     </div>
                  )}
                </div>
              )}

            </div>
          </div>
        )}

        {/* Selection Flow Modal Overlay */}
        {isBlurOverlayVisible && (() => {
          const indiaNodeData = countries.find(c => c.name === 'India')
          const indiaPlotCount = indiaNodeData ? indiaNodeData.plot_count : 0

          const tnNodeData = states.find(s => s.name === 'Tamil Nadu')
          const tnPlotCount = tnNodeData ? tnNodeData.plot_count : 0

          const cbeNodeData = districts.find(d => d.name === 'Coimbatore')
          const cbePlotCount = cbeNodeData ? cbeNodeData.plot_count : 0

          return (
            <div className="map-backdrop-overlay">
              {currentStep === 'REGION' && (
                <div className="map-selection-card">
                  <div className="map-selection-header">
                    <div className="map-selection-icon">
                      <img src="/world.png" alt="World" />
                    </div>
                    <h2 className="map-selection-title">Select Region</h2>
                    <p className="map-selection-subtitle">Choose a region to explore registered land parcels</p>
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

              {currentStep === 'STATE' && (
                <div className="map-selection-card">
                  <div className="map-selection-header">
                    <div className="map-selection-icon">
                      <img src="/india.png" alt="India" />
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

              {currentStep === 'DISTRICT' && (
                <div className="map-selection-card">
                  <div className="map-selection-header">
                    <div className="map-selection-icon">
                      <img src="/tamil-nadu.png" alt="Tamil Nadu" />
                    </div>
                    <h2 className="map-selection-title">Select District</h2>
                    <p className="map-selection-subtitle">Tamil Nadu • Choose district to explore parcel registry</p>
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
                    Explore District Parcels →
                  </button>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* PDF Preview Modal */}
      {pdfModal && (
        <div className="modal-overlay" onClick={() => setPdfModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: '900px', height: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FileText size={18} style={{ color: 'var(--color-primary)' }} />
                <span>{pdfModal.docType} Document</span>
              </span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setPdfModal(null)}
              >
                Close
              </button>
            </div>
            <div style={{ flex: 1 }}>
              <iframe
                src={pdfModal.url}
                title={pdfModal.docType}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Parcel label styles */}
      <style>{`
        .parcel-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          pointer-events: none;
        }
        .parcel-id {
          background: rgba(37,99,235,0.85);
          color: #fff;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }
        .parcel-name {
          background: rgba(255,255,255,0.85);
          color: #1e293b;
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 500;
          margin-top: 2px;
          white-space: nowrap;
          display: none;
        }
      `}</style>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <span style={{
        fontSize: '0.72rem',
        fontWeight: '700',
        color: 'var(--color-text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'block',
        marginBottom: '0.2rem'
      }}>
        {label}
      </span>
      <span style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--color-text)', wordBreak: 'break-word', display: 'block', lineHeight: '1.45' }}>
        {value || '—'}
      </span>
    </div>
  )
}
