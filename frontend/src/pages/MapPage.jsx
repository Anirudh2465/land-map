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
import { MarkerClusterGroup } from 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Fix Leaflet default icon paths in Vite bundled environments
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})
import { getPlots, getPlot, getPlotKmlUrl } from '../api/plots'
import { getDocumentUrl } from '../api/documents'
import { getNodeByName, getCountries, getChildren, getNode } from '../api/geo'
import { geocodeAddress, getRoute, getNearbyPlaces } from '../api/routing'
import { getCountryCenter, getStateCenter, getDistrictCenter, getTalukCenter } from '../data/tnCoordinates'
import Header from '../components/Header'
import { Search, ChevronDown, ChevronUp, X, FileText, Download, Eye, ChevronRight, MapPin, Navigation, ArrowLeftRight, Map as MapIcon, Clock, Car, Bike, Footprints, Pin, PinOff, Folder, FolderOpen, Ruler } from 'lucide-react'

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

const DOC_CATEGORY_CONFIG = [
  {
    key: 'land_documents',
    title: 'Land Documents',
    types: ['DEED', 'PARENT_DOCUMENT', 'FMB', 'FMB_SKETCH', 'TSLR_SKETCH', 'PATTA', 'EC_DETAILS', 'ADANGAL', 'A_REGISTER'],
    color: '#2563eb'
  },
  {
    key: 'land_official_details',
    title: 'Land Official Details',
    types: ['PROPERTY_TAX', 'AERIAL_PHOTO', 'DISPUTE_DETAILS', 'APPROVED_PLAN'],
    color: '#0891b2'
  },
  {
    key: 'buildup_details',
    title: 'Build-up Details',
    types: ['BUILDING_PLAN', 'PLAN_APPROVAL', 'PLAN_APPROVAL_LETTER', 'BUILDING_PERMIT', 'BUILDING_PERMIT_LETTER'],
    color: '#d97706'
  },
  {
    key: 'source_files',
    title: 'Source & Spatial Files',
    types: ['SOURCE_KML', 'KML', 'SHAPEFILE'],
    color: '#059669'
  }
]

const DOC_TITLES = {
  DEED: 'Deed Document',
  PARENT_DOCUMENT: 'Parent Document',
  FMB: 'FMB / TSLR Sketch',
  FMB_SKETCH: 'FMB / TSLR Sketch',
  TSLR_SKETCH: 'FMB / TSLR Sketch',
  PATTA: 'Patta / Chitta Details',
  EC_DETAILS: 'EC Details',
  BUILDING_PLAN: 'Building Plan',
  PLAN_APPROVAL: 'Plan Approval Letter',
  PLAN_APPROVAL_LETTER: 'Plan Approval Letter',
  BUILDING_PERMIT: 'Building Permit Letter',
  BUILDING_PERMIT_LETTER: 'Building Permit Letter',
  PROPERTY_TAX: 'Property Tax',
  AERIAL_PHOTO: 'Aerial / Field Photos',
  DISPUTE_DETAILS: 'Dispute Details',
  ADANGAL: 'Adangal',
  A_REGISTER: 'A-Register',
  APPROVED_PLAN: 'Approved Industry / Residential Plan',
  SOURCE_KML: 'Boundary KML File',
  KML: 'Boundary KML File',
  SHAPEFILE: 'Shapefile'
}

// Coordinates and view constants
const WORLD_VIEW = { center: [20, 20], zoom: 3.5 }
const INDIA_VIEW = { center: [22.5, 79.5], zoom: 5.5 }
const TN_VIEW = { center: [11.12, 78.65], zoom: 7.8 }

// Coimbatore district approximate bounds [SW, NE]
// Area calculation for polygon based on earth radius
function calculateArea(latLngs) {
  let area = 0
  const d2r = Math.PI / 180
  const earthRadius = 6378137 // meters
  
  if (latLngs.length > 2) {
    for (let i = 0; i < latLngs.length; i++) {
      let p1 = latLngs[i]
      let p2 = latLngs[(i + 1) % latLngs.length]
      
      area += (p2.lng - p1.lng) * d2r * (2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r))
    }
    area = area * earthRadius * earthRadius / 2.0
  }
  return Math.abs(area)
}

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

const VILLAGE_COORDS = {
  'Bogampatti': { center: [10.8972, 77.0884], zoom: 15 },
  'Madukkarai': { center: [10.8995, 76.9445], zoom: 15 },
  'Singanallur': { center: [11.0092, 77.0446], zoom: 15 },
  'Coimbatore North': { center: [11.0250, 76.9500], zoom: 15 },
}

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
  const params = useParams()
  const districtId = params.districtId || params['*'] || null
  const navigate = useNavigate()

  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const labelsLayerRef = useRef(null)
  const satelliteGroupRef = useRef(null)
  const layersRef = useRef([]) // { layer, plot, labelMarker }
  const clusterGroupRef = useRef(null)
  const regionPinsLayerRef = useRef(null)
  const canvasRendererRef = useRef(null)
  const selectedLayerRef = useRef(null)
  const selectedPlotRef = useRef(null)

  const [plots, setPlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPlot, setSelectedPlot] = useState(null)
  const [activeNode, setActiveNode] = useState(null)
  const [pdfModal, setPdfModal] = useState(null) // { url, docType }
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pinnedPos, setPinnedPos] = useState({ x: 0, y: 0, placement: 'top' })
  const [activeBasemap, setActiveBasemap] = useState('Satellite')
  const [isPinned, setIsPinned] = useState(false)
  const [floatingPos, setFloatingPos] = useState(() => ({
    x: typeof window !== 'undefined' && window.innerWidth >= 840 ? 405 : 16,
    y: typeof window !== 'undefined' && window.innerWidth >= 840 ? 84 : 300,
  }))
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef({ startX: 0, startY: 0, initialLeft: 0, initialTop: 0 })
  const panelRef = useRef(null)
  const flyToSafetyTimerRef = useRef(null)

  // Selection flow states
  const [currentStep, setCurrentStep] = useState(districtId ? 'READY' : 'REGION')
  const currentStepRef = useRef(currentStep)
  const programmaticZoomUntilRef = useRef(0)
  const [isBlurOverlayVisible, setIsBlurOverlayVisible] = useState(true)
  const [isNavCardCollapsed, setIsNavCardCollapsed] = useState(false)
  const [selectedState, setSelectedState] = useState('Tamil Nadu')
  const [selectedDistrict, setSelectedDistrict] = useState('Coimbatore')
  const [selectedDistrictNode, setSelectedDistrictNode] = useState(null)
  const [selectedTaluk, setSelectedTaluk] = useState('')
  const [selectedTalukNode, setSelectedTalukNode] = useState(null)
  const [selectedVillage, setSelectedVillage] = useState('')
  const [selectedVillageNode, setSelectedVillageNode] = useState(null)
  const [taluksList, setTaluksList] = useState([])
  const [villagesList, setVillagesList] = useState([])
  const [activeDistrictId, setActiveDistrictId] = useState(districtId || null)
  
  const [isMeasureMode, setIsMeasureMode] = useState(false)
  const measureModeRef = useRef(isMeasureMode)
  
  const [isGlobalMeasure, setIsGlobalMeasure] = useState(false)
  const [isFreehandMeasure, setIsFreehandMeasure] = useState(false)
  const [globalAreaUnit, setGlobalAreaUnit] = useState('sqm')
  
  const POLYGON_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6']
  
  const globalMeasureModeRef = useRef(isGlobalMeasure)
  const freehandMeasureModeRef = useRef(isFreehandMeasure)
  const globalAreaUnitRef = useRef(globalAreaUnit)
  const isDrawingFreehandRef = useRef(false)
  
  const globalPolygonsRef = useRef([]) // Store finalized polygons { points, color }
  const globalMeasurePointsRef = useRef([])
  const globalMeasureLayerRef = useRef(null)
  
  const [measureRenderTrigger, setMeasureRenderTrigger] = useState(0)
  
  useEffect(() => {
    measureModeRef.current = isMeasureMode
  }, [isMeasureMode])

  useEffect(() => {
    globalMeasureModeRef.current = isGlobalMeasure
    freehandMeasureModeRef.current = isFreehandMeasure
    
    // Toggle map dragging for freehand
    if (mapInstanceRef.current) {
      if (isGlobalMeasure && isFreehandMeasure) {
        mapInstanceRef.current.dragging.disable()
      } else {
        mapInstanceRef.current.dragging.enable()
      }
    }
  }, [isGlobalMeasure, isFreehandMeasure])

  useEffect(() => {
    globalAreaUnitRef.current = globalAreaUnit
    if (mapInstanceRef.current && globalMeasureModeRef.current) {
      updateGlobalMeasurePolygon(mapInstanceRef.current)
    }
  }, [globalAreaUnit])

  const [countries, setCountries] = useState([])
  const [states, setStates] = useState([])
  const [districts, setDistricts] = useState([])
  const [indiaNode, setIndiaNode] = useState(null)
  const [tnNode, setTnNode] = useState(null)
  const [selectedStateNode, setSelectedStateNode] = useState(null)
  const skipNextActiveIdFetchRef = useRef(false)

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
  const distanceLineRef = useRef(null)
  const distanceMarkerRef = useRef(null)

  const [geocodeResults, setGeocodeResults] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [selectedDestCoords, setSelectedDestCoords] = useState(null)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedLayerRef.current) {
          handleClosePanel()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const [nearbyCategory, setNearbyCategory] = useState('')
  const [nearbyPlaces, setNearbyPlaces] = useState([])
  const [isFetchingNearby, setIsFetchingNearby] = useState(false)
  const [nearbyError, setNearbyError] = useState('')
  const [expandedNearbyPlaceId, setExpandedNearbyPlaceId] = useState(null)
  const [nearbyRadius, setNearbyRadius] = useState(2000)
  const nearbyLayerRef = useRef(null)

  // Document Folder State (default open for all active category folders)
  const [expandedFolders, setExpandedFolders] = useState({})

  const toggleFolder = (folderKey) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderKey]: prev[folderKey] === undefined ? false : !prev[folderKey]
    }))
  }

  const getOriginalFilename = (storageKey, docType, isDefaultKml = false) => {
    if (isDefaultKml) {
      return `${selectedPlot?.plot_number || 'parcel'}_boundary.kml`
    }
    if (!storageKey) return 'Document';
    const parts = storageKey.split('/');
    const fileWithPrefix = parts[parts.length - 1];
    return fileWithPrefix.replace(/^[A-Za-z0-9_]+?_\d+_/, '');
  }

  const updateGlobalMeasurePolygon = (map) => {
    if (globalMeasureLayerRef.current) {
      map.removeLayer(globalMeasureLayerRef.current)
      globalMeasureLayerRef.current = null
    }
    
    const layers = []
    
    // Draw finalized polygons
    globalPolygonsRef.current.forEach(poly => {
      const polygon = L.polygon(poly.points, { color: poly.color, weight: 3, fillColor: poly.color, fillOpacity: 0.35 })
      const areaSqm = calculateArea(poly.points)
      const unit = globalAreaUnitRef.current
      let areaStr = ''
      if (unit === 'sqm') areaStr = Math.round(areaSqm).toLocaleString() + ' sq m'
      else if (unit === 'hectares') areaStr = (areaSqm / 10000).toFixed(3) + ' ha'
      else if (unit === 'acres') areaStr = (areaSqm * 0.000247105).toFixed(3) + ' acres'
      else if (unit === 'sqft') areaStr = Math.round(areaSqm * 10.7639).toLocaleString() + ' sq ft'
      
      polygon.bindTooltip(`Area: ${areaStr}`, { permanent: true, direction: 'center', className: 'area-tooltip' })
      layers.push(polygon)
    })
    
    // Draw currently drawing points
    const pts = globalMeasurePointsRef.current
    if (pts.length > 0) {
      const activeColor = POLYGON_COLORS[globalPolygonsRef.current.length % POLYGON_COLORS.length]
      
      pts.forEach(pt => {
        if (!freehandMeasureModeRef.current) {
          layers.push(L.circleMarker(pt, { radius: 5, color: activeColor, fillColor: '#fff', fillOpacity: 1, weight: 2 }))
        }
      })
      
      if (pts.length === 2) {
        layers.push(L.polyline(pts, { color: activeColor, weight: 4, dashArray: freehandMeasureModeRef.current ? '' : '5 5' }))
      } else if (pts.length > 2) {
        const polygon = L.polygon(pts, { color: activeColor, weight: 3, fillColor: activeColor, fillOpacity: 0.35 })
        
        const areaSqm = calculateArea(pts)
        const unit = globalAreaUnitRef.current
        let areaStr = ''
        if (unit === 'sqm') areaStr = Math.round(areaSqm).toLocaleString() + ' sq m'
        else if (unit === 'hectares') areaStr = (areaSqm / 10000).toFixed(3) + ' ha'
        else if (unit === 'acres') areaStr = (areaSqm * 0.000247105).toFixed(3) + ' acres'
        else if (unit === 'sqft') areaStr = Math.round(areaSqm * 10.7639).toLocaleString() + ' sq ft'
        
        polygon.bindTooltip(`Area: ${areaStr}`, { permanent: true, direction: 'center', className: 'area-tooltip' })
        layers.push(polygon)
      }
    }
    
    if (layers.length > 0) {
      const group = L.featureGroup(layers)
      group.addTo(map)
      globalMeasureLayerRef.current = group
    }
  }

  const clearRouteAndNearby = () => {
    if (routeLayerRef.current) {
      mapInstanceRef.current?.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }
    if (nearbyLayerRef.current) {
      mapInstanceRef.current?.removeLayer(nearbyLayerRef.current)
      nearbyLayerRef.current = null
    }
    if (distanceLineRef.current) {
      mapInstanceRef.current?.removeLayer(distanceLineRef.current)
      distanceLineRef.current = null
    }
    if (distanceMarkerRef.current) {
      mapInstanceRef.current?.removeLayer(distanceMarkerRef.current)
      distanceMarkerRef.current = null
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

    const initialCenter = WORLD_VIEW.center
    const initialZoom = WORLD_VIEW.zoom

    const map = L.map(mapRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 3.5,
      maxZoom: 22,
      zoomControl: true,
      zoomAnimationThreshold: 8,
    })

    // Monkey-patch _stop to prevent corrupted zoom animation state when flyTo or animations are interrupted
    const originalStop = map._stop
    map._stop = function () {
      const wasAnimatingZoom = this._animatingZoom
      const res = originalStop.apply(this, arguments)
      if (wasAnimatingZoom) {
        this._animatingZoom = false
        if (this._mapPane) {
          L.DomUtil.removeClass(this._mapPane, 'leaflet-zoom-anim')
        }
        this._resetView(this.getCenter(), this.getZoom())
      }
      return res
    }
    
    // Create dedicated labels pane so overlay layers (places/roads) stay above tile layers
    map.createPane('labelsPane')
    map.getPane('labelsPane').style.zIndex = '350'
    map.getPane('labelsPane').style.pointerEvents = 'none'

    // 1. Satellite Base
    const satelliteLowRes = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxNativeZoom: 10, maxZoom: 22 }
    )
    const satelliteHighRes = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri', maxNativeZoom: 18, maxZoom: 22, keepBuffer: 4 }
    )
    const satelliteGroup = L.layerGroup([satelliteLowRes, satelliteHighRes])
    satelliteGroupRef.current = satelliteGroup

    // 2. Default Map
    const cartoApiKey = import.meta.env.VITE_CARTO_API_KEY
    const cartoUrl = cartoApiKey 
      ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${cartoApiKey}`
      : 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
      
    const defaultMap = L.tileLayer(
      cartoUrl,
      { attribution: '© OpenStreetMap contributors © CARTO', maxZoom: 22 }
    )

    // 3. Terrain Map
    const terrainMap = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri', maxNativeZoom: 18, maxZoom: 22 }
    )

    const baseMaps = {
      "Satellite": satelliteGroup,
      "Default": defaultMap,
      "Terrain": terrainMap
    }

    // Default to Satellite Map initially
    satelliteGroup.addTo(map)

    L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(map)

    map.on('baselayerchange', (e) => {
      setActiveBasemap(e.name)
    })

    map.on('mousedown', (e) => {
      if (globalMeasureModeRef.current && freehandMeasureModeRef.current) {
        if (e.originalEvent && e.originalEvent.preventDefault) {
          e.originalEvent.preventDefault() // Prevents browser image dragging
        }
        isDrawingFreehandRef.current = true
        globalMeasurePointsRef.current.push(e.latlng)
        updateGlobalMeasurePolygon(map)
      }
    })

    map.on('mousemove', (e) => {
      if (globalMeasureModeRef.current && freehandMeasureModeRef.current && isDrawingFreehandRef.current) {
        const pts = globalMeasurePointsRef.current
        const lastPt = pts[pts.length - 1]
        if (lastPt) {
          const p1 = map.latLngToContainerPoint(lastPt)
          const p2 = map.latLngToContainerPoint(e.latlng)
          if ((p1.x - p2.x)**2 + (p1.y - p2.y)**2 > 16) {
            pts.push(e.latlng)
            updateGlobalMeasurePolygon(map)
          }
        }
      }
    })

    const handleGlobalMouseUp = () => {
      if (isDrawingFreehandRef.current) {
        isDrawingFreehandRef.current = false
        const pts = globalMeasurePointsRef.current
        if (pts.length > 2) {
          const color = POLYGON_COLORS[globalPolygonsRef.current.length % POLYGON_COLORS.length]
          globalPolygonsRef.current.push({ points: [...pts], color })
        }
        globalMeasurePointsRef.current = []
        if (mapInstanceRef.current) {
          updateGlobalMeasurePolygon(mapInstanceRef.current)
        }
      }
    }
    window.addEventListener('mouseup', handleGlobalMouseUp)

    const handleDragStart = (e) => {
      if (globalMeasureModeRef.current && freehandMeasureModeRef.current) {
        e.preventDefault()
      }
    }
    const mapContainer = map.getContainer()
    mapContainer.addEventListener('dragstart', handleDragStart)

    map.on('click', (e) => {
      if (globalMeasureModeRef.current) {
        if (freehandMeasureModeRef.current) return // Click is handled by mousedown/up in freehand
        globalMeasurePointsRef.current.push(e.latlng)
        updateGlobalMeasurePolygon(map)
        setMeasureRenderTrigger(prev => prev + 1)
        return
      }
      const sp = selectedPlotRef.current
      if (sp && sp.lat != null && sp.lon != null) {
        if (measureModeRef.current) {
          // Measure exact distance from clicked point to the plot
          const clickedLatLng = e.latlng
          const plotLatLng = L.latLng(sp.lat, sp.lon)
          const distance = clickedLatLng.distanceTo(plotLatLng)
          
          const distanceStr = distance > 1000 ? (distance / 1000).toFixed(2) + ' km' : Math.round(distance) + ' m'
          
          if (distanceLineRef.current) map.removeLayer(distanceLineRef.current)
          if (distanceMarkerRef.current) map.removeLayer(distanceMarkerRef.current)
          
          distanceLineRef.current = L.polyline([clickedLatLng, plotLatLng], { color: '#0ea5e9', dashArray: '5, 10', weight: 3 }).addTo(map)
          distanceMarkerRef.current = L.marker(clickedLatLng, { 
            icon: L.divIcon({
              className: 'custom-div-icon',
              html: `<div style="background: white; border: 2px solid #0ea5e9; border-radius: 50%; width: 12px; height: 12px;"></div>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            })
          }).addTo(map)
          .bindPopup(`<div style="font-weight: 600; font-family: inherit; font-size: 13px;">Distance to Plot:<br/><span style="color: #0ea5e9; font-size: 15px;">${distanceStr}</span></div>`, { closeOnClick: false, autoClose: false })
          .openPopup()
        } else {
          // Measure mode off -> clicking map deselects the plot
          if (selectedLayerRef.current) {
            handleClosePanel()
          }
        }
      } else {
        if (selectedLayerRef.current) {
          handleClosePanel()
        }
      }
    })

    map.on('contextmenu', (e) => {
      if (globalMeasureModeRef.current) {
        if (globalMeasurePointsRef.current.length > 0) {
          globalMeasurePointsRef.current.pop()
          updateGlobalMeasurePolygon(map)
          setMeasureRenderTrigger(prev => prev + 1)
        } else if (globalPolygonsRef.current.length > 0) {
          globalPolygonsRef.current.pop()
          updateGlobalMeasurePolygon(map)
          setMeasureRenderTrigger(prev => prev + 1)
        } else {
          setIsGlobalMeasure(false)
        }
        return
      }
      if (selectedLayerRef.current) {
        handleClosePanel()
      }
    })

    // Esri World Boundaries and Places (labels + roads)
    const labelsLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { pane: 'labelsPane', maxNativeZoom: 18, maxZoom: 22 }
    )
    labelsLayerRef.current = labelsLayer

    // Fit Tamil Nadu overview initially when jumping directly to a URL node ID
    if (districtId) {
      map.setView(TN_VIEW.center, TN_VIEW.zoom)
    }

    mapInstanceRef.current = map
    canvasRendererRef.current = L.canvas({ padding: 0.5 })

    // Cleanup on unmount
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp)
      mapContainer.removeEventListener('dragstart', handleDragStart)
      if (flyToSafetyTimerRef.current) {
        clearTimeout(flyToSafetyTimerRef.current)
        flyToSafetyTimerRef.current = null
      }
      map.remove()
      mapInstanceRef.current = null
      labelsLayerRef.current = null
    }
  }, [districtId])

  const markProgrammaticZoom = (ms = 1400) => {
    programmaticZoomUntilRef.current = Date.now() + ms
  }

  useEffect(() => {
    currentStepRef.current = currentStep
  }, [currentStep])

  // ── Zoom-Out Hierarchy Sync ──────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    const handleZoomOutSync = () => {
      if (Date.now() < programmaticZoomUntilRef.current) return
      const step = currentStepRef.current
      if (!step || step.startsWith('PANNING_')) return

      const zoom = map.getZoom()
      let nextStep = null

      if (step === 'READY' || step === 'VILLAGE') {
        if (zoom <= 4.2) nextStep = 'REGION'
        else if (zoom <= 6.2) nextStep = 'STATE'
        else if (zoom <= 8.5) nextStep = 'DISTRICT'
        else if (zoom <= 11.5) nextStep = 'TALUK'
      } else if (step === 'TALUK') {
        if (zoom <= 4.2) nextStep = 'REGION'
        else if (zoom <= 6.2) nextStep = 'STATE'
        else if (zoom <= 8.5) nextStep = 'DISTRICT'
      } else if (step === 'DISTRICT') {
        if (zoom <= 4.2) nextStep = 'REGION'
        else if (zoom <= 6.2) nextStep = 'STATE'
      } else if (step === 'STATE') {
        if (zoom <= 4.2) nextStep = 'REGION'
      }

      if (nextStep && nextStep !== step) {
        if (step === 'READY' || step === 'VILLAGE') {
          selectedPlotRef.current = null
          setSelectedPlot(null)
          setSelectedVillageNode(null)
          setPlots([])
          if (selectedLayerRef.current) {
            selectedLayerRef.current.layer.setStyle(PARCEL_STYLE)
            selectedLayerRef.current = null
          }
        }
        setCurrentStep(nextStep)
        setIsBlurOverlayVisible(true)
      }
    }

    map.on('zoomend', handleZoomOutSync)
    return () => {
      map.off('zoomend', handleZoomOutSync)
    }
  }, [])

  // ── Dynamic Visibility of KML Parcels & Places/Labels Layer ─────────────
  useEffect(() => {
    const map = mapInstanceRef.current
    const labelsLayer = labelsLayerRef.current
    if (!map) return

    if (currentStep === 'READY' || currentStep === 'VILLAGE') {
      // Show reference labels & boundaries ONLY on Satellite basemap
      if (activeBasemap === 'Satellite') {
        if (labelsLayer && !map.hasLayer(labelsLayer)) {
          labelsLayer.addTo(map)
        }
      } else {
        if (labelsLayer && map.hasLayer(labelsLayer)) {
          map.removeLayer(labelsLayer)
        }
      }

      // Show parcel GeoJSON polygons
      layersRef.current.forEach(({ layer }) => {
        if (!map.hasLayer(layer)) {
          layer.addTo(map)
        }
      })
    } else {
      // In upper selection steps: hide reference labels & parcel layers
      if (labelsLayer && map.hasLayer(labelsLayer)) {
        map.removeLayer(labelsLayer)
      }
      // Hide parcel GeoJSON polygons, pins & label markers
      if (clusterGroupRef.current && map.hasLayer(clusterGroupRef.current)) {
        map.removeLayer(clusterGroupRef.current)
      }
      layersRef.current.forEach(({ layer, labelMarker }) => {
        if (map.hasLayer(layer)) {
          map.removeLayer(layer)
        }
        if (labelMarker && map.hasLayer(labelMarker)) {
          map.removeLayer(labelMarker)
        }
      })
    }
  }, [currentStep, plots, activeBasemap])

  // ── Hierarchical Region Pins (Country / State / District / Taluk) ─────
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (regionPinsLayerRef.current) {
      map.removeLayer(regionPinsLayerRef.current)
      regionPinsLayerRef.current = null
    }

    const addRegionPin = (group, name, count, coords, onClick) => {
      if (!coords) return
      const marker = L.marker(coords.center, {
        icon: L.divIcon({
          className: 'region-pin-wrapper',
          html: `<div class="region-pin-badge" title="${name} (${count} parcel${count === 1 ? '' : 's'})">
                   <span class="region-pin-name">${name}</span>
                   <span class="region-pin-count">${count}</span>
                 </div>`,
          iconSize: null,
          iconAnchor: [0, 0],
        }),
      })
      marker.on('click', (e) => {
        if (e) L.DomEvent.stopPropagation(e)
        onClick()
      })
      group.addLayer(marker)
    }

    const group = L.layerGroup()

    if (currentStep === 'REGION') {
      countries.filter(c => c.plot_count > 0).forEach(c => {
        const coords = getCountryCenter(c.name)
        addRegionPin(group, c.name, c.plot_count, coords, () => {
          if (c.name === 'India') {
            handleSelectIndia()
          } else {
            setActiveDistrictId(c.id)
          }
        })
      })
    } else if (currentStep === 'STATE') {
      states.filter(s => s.plot_count > 0).forEach(s => {
        const coords = getStateCenter(s.name)
        addRegionPin(group, s.name, s.plot_count, coords, () => handleSelectState(s.name))
      })
    } else if (currentStep === 'DISTRICT') {
      districts.filter(d => d.plot_count > 0).forEach(d => {
        const coords = getDistrictCenter(d.name)
        addRegionPin(group, d.name, d.plot_count, coords, () => handleSelectDistrict(d.name))
      })
    } else if (currentStep === 'TALUK') {
      taluksList.filter(t => t.plot_count > 0).forEach(t => {
        const coords = getTalukCenter(selectedDistrict, t.name)
        addRegionPin(group, t.name, t.plot_count, coords, () => handleSelectTaluk(t.name))
      })
    }

    if (group.getLayers().length > 0) {
      group.addTo(map)
      regionPinsLayerRef.current = group
    }

    return () => {
      if (regionPinsLayerRef.current && map.hasLayer(regionPinsLayerRef.current)) {
        map.removeLayer(regionPinsLayerRef.current)
        regionPinsLayerRef.current = null
      }
    }
  }, [currentStep, countries, states, districts, taluksList, selectedDistrict])


  // ── Plot Selection ─────────────────────────────────────────────────────
  const selectPlot = (plot) => {
    setSelectedPlot(plot)
    setIsPinned(false)
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
    if (skipNextActiveIdFetchRef.current) {
      skipNextActiveIdFetchRef.current = false
      return
    }
    // If the map is currently animating (panning/zooming), don't interrupt it
    if (typeof currentStep === 'string' && currentStep.startsWith('PANNING_')) return
    setLoading(true)

    const map = mapInstanceRef.current

    // Fetch region details
    getNode(activeDistrictId).then(async node => {
      setActiveNode(node)
      if (node?.level === 'TALUK') {
        setSelectedTalukNode(node)
        setSelectedTaluk(node.name)
        const parentDist = node.parent_id ? await getNode(node.parent_id).catch(() => null) : null
        if (parentDist) {
          setSelectedDistrictNode(parentDist)
          setSelectedDistrict(parentDist.name)
        }
        const tCoords = getTalukCenter(parentDist?.name, node.name) || getDistrictCenter(parentDist?.name)
        if (map && tCoords) {
          map.flyTo(tCoords.center, tCoords.zoom, { duration: 0.8 })
        }
        getChildren(node.id).then(setVillagesList).catch(() => {})
        setCurrentStep('VILLAGE')
        setIsBlurOverlayVisible(true)
        setPlots([])
        setLoading(false)
      } else if (node?.level === 'VILLAGE') {
        setSelectedVillageNode(node)
        setSelectedVillage(node.name)
        setCurrentStep('READY')
        setIsBlurOverlayVisible(false)
        getPlots(activeDistrictId)
          .then(loaded => {
            setPlots(loaded)
            if (map && loaded.length > 0) {
              const pts = loaded.filter(p => p.lat != null && p.lon != null).map(p => [p.lat, p.lon])
              if (pts.length === 1) map.flyTo(pts[0], 16, { duration: 0.8 })
              else if (pts.length > 1) map.flyToBounds(L.latLngBounds(pts), { padding: [80, 80], maxZoom: 16, duration: 0.8 })
            }
          })
          .catch(err => setError(err.response?.data?.detail || 'Failed to load parcels.'))
          .finally(() => setLoading(false))
      } else if (node?.level === 'DISTRICT') {
        setSelectedDistrictNode(node)
        setSelectedDistrict(node.name)
        const dCoords = getDistrictCenter(node.name)
        if (map && dCoords) {
          map.flyTo(dCoords.center, dCoords.zoom, { duration: 0.8 })
        }
        getChildren(node.id).then(tList => {
          setTaluksList(tList)
          if (tList.length > 0) {
            setSelectedTaluk(tList[0].name)
            setSelectedTalukNode(tList[0])
          }
        }).catch(() => {})
        setCurrentStep('TALUK')
        setIsBlurOverlayVisible(true)
        setPlots([])
        setLoading(false)
      } else {
        // COUNTRY / overseas
        setCurrentStep('READY')
        setIsBlurOverlayVisible(false)
        getPlots(activeDistrictId)
          .then(setPlots)
          .catch(err => setError(err.response?.data?.detail || 'Failed to load parcels.'))
          .finally(() => setLoading(false))
      }
    }).catch(() => {
      setLoading(false)
    })
  }, [activeDistrictId])

  // ── Load Geo Nodes for Counts ──────────────────────────────────────
  useEffect(() => {
    getCountries().then(setCountries).catch(() => {})
  }, [])

  useEffect(() => {
    if (indiaNode) {
      getChildren(indiaNode.id).then(stList => {
        setStates(stList)
        const tn = stList.find(s => s.name === 'Tamil Nadu')
        if (tn) {
          setSelectedState('Tamil Nadu')
          setSelectedStateNode(tn)
          setTnNode(tn)
        } else if (stList.length > 0) {
          setSelectedState(stList[0].name)
          setSelectedStateNode(stList[0])
        }
      }).catch(() => {})
    }
  }, [indiaNode])

  useEffect(() => {
    const stateObj = selectedStateNode || tnNode
    if (stateObj) {
      getChildren(stateObj.id).then(dtList => {
        setDistricts(dtList)
        const cbe = dtList.find(d => d.name === 'Coimbatore')
        if (cbe) {
          setSelectedDistrict('Coimbatore')
        } else if (dtList.length > 0) {
          setSelectedDistrict(dtList[0].name)
        } else {
          setSelectedDistrict('')
        }
      }).catch(() => {})
    }
  }, [selectedStateNode, tnNode])

  // ── Pin / Unpin & Floating Card Controls ────────────────────────────
  const togglePin = (e) => {
    e?.stopPropagation()
    if (isPinned) {
      // Unpinning: capture current bounding rect of the card
      if (panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect()
        setFloatingPos({
          x: Math.max(10, Math.min(window.innerWidth - 390, rect.left)),
          y: Math.max(70, Math.min(window.innerHeight - 100, rect.top))
        })
      }
      setIsPinned(false)
    } else {
      // Pinning back: snap directly above the plot
      setIsPinned(true)
    }
  }

  const handleHeaderMouseDown = (e) => {
    if (isPinned) return
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return
    e.preventDefault()

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: floatingPos.x,
      initialTop: floatingPos.y,
    }
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - dragRef.current.startX
      const deltaY = e.clientY - dragRef.current.startY
      
      const newX = Math.max(10, Math.min(window.innerWidth - 390, dragRef.current.initialLeft + deltaX))
      const newY = Math.max(70, Math.min(window.innerHeight - 100, dragRef.current.initialTop + deltaY))
      
      setFloatingPos({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, floatingPos])

  // ── Pinned Card Position Tracking (Pure React, No Leaflet Popup) ────
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !selectedPlot || !isPinned) return

    const getCenterLatLng = () => {
      if (selectedPlot.lat != null && selectedPlot.lon != null) {
        return L.latLng(selectedPlot.lat, selectedPlot.lon)
      }
      if (selectedLayerRef.current?.layer) {
        return selectedLayerRef.current.layer.getBounds().getCenter()
      }
      return null
    }

    const computeCoords = (pt) => {
      const cardEl = panelRef.current
      const cardWidth = cardEl ? cardEl.offsetWidth : 380
      const cardHeight = cardEl ? cardEl.offsetHeight : 520
      const mapSize = map.getSize()
      const headerHeight = 70
      const margin = 16

      // Evaluate available headroom above parcel point
      const spaceAbove = pt.y - headerHeight
      const placement = spaceAbove < (cardHeight + 24) ? 'bottom' : 'top'

      // Horizontal clamping: keep card inside [margin, mapSize.x - margin]
      const halfW = cardWidth / 2
      const clampedX = Math.round(Math.max(halfW + margin, Math.min(mapSize.x - halfW - margin, pt.x)))

      // Vertical clamping based on placement
      let clampedY = Math.round(pt.y)
      if (placement === 'top') {
        if (clampedY - cardHeight - 16 < headerHeight + margin) {
          clampedY = headerHeight + margin + cardHeight + 16
        }
      } else {
        if (clampedY + cardHeight + 16 > mapSize.y - margin) {
          clampedY = mapSize.y - margin - cardHeight - 16
        }
      }

      return { clampedX, clampedY, placement }
    }

    const updatePinnedPos = () => {
      const latlng = getCenterLatLng()
      if (!latlng) return
      const pt = map.latLngToContainerPoint(latlng)
      const { clampedX, clampedY, placement } = computeCoords(pt)
      if (panelRef.current) {
        panelRef.current.style.transition = 'none'
        panelRef.current.style.left = `${clampedX}px`
        panelRef.current.style.top = `${clampedY}px`
      }
      setPinnedPos({ x: clampedX, y: clampedY, placement })
    }

    const handleZoomAnim = (e) => {
      const latlng = getCenterLatLng()
      if (!latlng || !panelRef.current) return
      const newLayerPoint = map._latLngToNewLayerPoint(latlng, e.zoom, e.center)
      const pt = map.layerPointToContainerPoint(newLayerPoint)
      const { clampedX, clampedY, placement } = computeCoords(pt)

      panelRef.current.style.transition = 'left 0.25s cubic-bezier(0,0,0.25,1), top 0.25s cubic-bezier(0,0,0.25,1)'
      panelRef.current.style.left = `${clampedX}px`
      panelRef.current.style.top = `${clampedY}px`
      setPinnedPos({ x: clampedX, y: clampedY, placement })
    }

    updatePinnedPos()
    map.on('move zoom zoomend viewreset', updatePinnedPos)
    map.on('zoomanim', handleZoomAnim)
    window.addEventListener('resize', updatePinnedPos)

    const panelEl = panelRef.current
    return () => {
      map.off('move zoom zoomend viewreset', updatePinnedPos)
      map.off('zoomanim', handleZoomAnim)
      window.removeEventListener('resize', updatePinnedPos)
      if (panelEl) {
        panelEl.style.transition = 'none'
      }
    }
  }, [selectedPlot, isPinned])

  // ── Sync Parcel Center Label Visibility with Selected Plot ─────────
  useEffect(() => {
    selectedPlotRef.current = selectedPlot
    const map = mapInstanceRef.current
    if (!map) return
    const zoom = map.getZoom()

    layersRef.current.forEach(({ labelMarker, plot }) => {
      if (selectedPlot && selectedPlot.id === plot.id) {
        // Hide tiny label for the open plot
        if (map.hasLayer(labelMarker)) map.removeLayer(labelMarker)
      } else if (currentStep === 'READY' && zoom >= 14) {
        // Redisplay tiny label when closed or for non-selected plots
        if (!map.hasLayer(labelMarker)) labelMarker.addTo(map)
      }
    })
  }, [selectedPlot, currentStep])


  // ── Flow Handlers ───────────────────────────────────────────────────
  async function resolveGeocodeFallback(query, fallbackView) {
    try {
      const results = await geocodeAddress(query)
      if (results && results.length > 0) {
        const lat = parseFloat(results[0].lat)
        const lon = parseFloat(results[0].lon)
        if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
          return { center: [lat, lon], zoom: fallbackView?.zoom || 12 }
        }
      }
    } catch {
      // Offline or rate-limited — use fallback
    }
    return fallbackView
  }

  async function handleSelectIndia() {
    const node = await getNodeByName('COUNTRY', 'India').catch(() => null)
    setIndiaNode(node)
    setIsBlurOverlayVisible(false)
    setCurrentStep('PANNING_INDIA')
    const map = mapInstanceRef.current
    if (map) {
      markProgrammaticZoom(1300)
      map.flyTo(INDIA_VIEW.center, INDIA_VIEW.zoom, { duration: 1.0, easeLinearity: 0.25 })
      const startTime = Date.now()
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        setCurrentStep('STATE')
        setIsBlurOverlayVisible(true)
        if (map) map.invalidateSize()
      }
      const timer = setTimeout(finish, 1100)
      const onMoveEnd = () => {
        if (Date.now() - startTime < 800) {
          map.once('moveend', onMoveEnd)
          return
        }
        finish()
      }
      map.once('moveend', onMoveEnd)
    }
  }

  async function handleSelectState(stateName) {
    const targetState = stateName || selectedState || 'Tamil Nadu'
    const node = states.find(s => s.name === targetState)
      || await getNodeByName('STATE', targetState).catch(() => null)
    setSelectedState(targetState)
    setSelectedStateNode(node)
    if (targetState === 'Tamil Nadu') setTnNode(node)

    setIsBlurOverlayVisible(false)
    setCurrentStep('PANNING_TN')

    let targetView = getStateCenter(targetState)
    if (!targetView) {
      targetView = targetState === 'Tamil Nadu'
        ? TN_VIEW
        : await resolveGeocodeFallback(`${targetState}, India`, { center: INDIA_VIEW.center, zoom: 7 })
    }

    const map = mapInstanceRef.current
    if (map) {
      markProgrammaticZoom(1300)
      map.flyTo(targetView.center, targetView.zoom, { duration: 1.0, easeLinearity: 0.25 })
    }

    if (node) {
      const dtList = await getChildren(node.id).catch(() => [])
      setDistricts(dtList)
      const defaultDist = dtList.find(d => d.name === 'Coimbatore') || dtList[0]
      setSelectedDistrict(defaultDist ? defaultDist.name : '')
      setSelectedDistrictNode(defaultDist || null)
    } else {
      setDistricts([])
      setSelectedDistrict('')
      setSelectedDistrictNode(null)
    }

    if (map) {
      const startTime = Date.now()
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        setCurrentStep('DISTRICT')
        setIsBlurOverlayVisible(true)
        if (map) map.invalidateSize()
      }
      const timer = setTimeout(finish, 1100)
      const onMoveEnd = () => {
        if (Date.now() - startTime < 800) {
          map.once('moveend', onMoveEnd)
          return
        }
        finish()
      }
      map.once('moveend', onMoveEnd)
    }
  }

  async function handleSelectDistrict(districtName) {
    const targetDistrict = districtName || selectedDistrict || districts[0]?.name || 'Coimbatore'
    setSelectedDistrict(targetDistrict)
    setIsBlurOverlayVisible(false)
    setCurrentStep('PANNING_CBE')

    const map = mapInstanceRef.current
    let targetCoords = getDistrictCenter(targetDistrict)
    if (!targetCoords) {
      targetCoords = await resolveGeocodeFallback(
        `${targetDistrict}, ${selectedState || 'Tamil Nadu'}, India`,
        { center: CBE_BOUNDS.getCenter(), zoom: 10.5 }
      )
    }
    if (map && targetCoords) {
      markProgrammaticZoom(1300)
      map.flyTo(targetCoords.center, targetCoords.zoom, { duration: 1.0, easeLinearity: 0.25 })
    }

    let node = districts.find(d => d.name === targetDistrict) || null
    try {
      if (!node) {
        node = await getNodeByName('DISTRICT', targetDistrict)
      }
      setSelectedDistrictNode(node)

      if (node) {
        const taluksData = await getChildren(node.id).catch(() => [])
        setTaluksList(taluksData)
        if (taluksData.length > 0) {
          setSelectedTaluk(taluksData[0].name)
          setSelectedTalukNode(taluksData[0])
        } else {
          setSelectedTaluk('')
          setSelectedTalukNode(null)
        }
      } else {
        setTaluksList([])
        setSelectedTaluk('')
        setSelectedTalukNode(null)
      }
    } catch (e) {
      console.error('Error fetching taluks for district:', e)
      setTaluksList([])
      setSelectedTaluk('')
      setSelectedTalukNode(null)
    }

    const startTime = Date.now()
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (node?.id) {
        skipNextActiveIdFetchRef.current = true
        setActiveDistrictId(node.id)
      }
      setCurrentStep('TALUK')
      setIsBlurOverlayVisible(true)
      if (map) map.invalidateSize()
    }

    const timer = setTimeout(finish, 1100)

    if (map) {
      const onMoveEnd = () => {
        const elapsed = Date.now() - startTime
        if (elapsed < 800) {
          map.once('moveend', onMoveEnd)
          return
        }
        finish()
      }
      map.once('moveend', onMoveEnd)
    } else {
      finish()
    }
  }

  async function handleSelectTaluk(talukName) {
    const targetName = talukName || selectedTaluk || (taluksList[0]?.name) || ''
    if (!targetName) return
    const talukObj = taluksList.find(t => t.name === targetName) || { id: targetName, name: targetName }
    setSelectedTaluk(targetName)
    setSelectedTalukNode(talukObj)

    setIsBlurOverlayVisible(false)
    setCurrentStep('PANNING_TALUK')

    const map = mapInstanceRef.current
    const fallbackDistrictView = getDistrictCenter(selectedDistrict) || { center: CBE_BOUNDS.getCenter(), zoom: 12 }
    let coords = getTalukCenter(selectedDistrict, targetName)
    if (!coords) {
      coords = await resolveGeocodeFallback(
        `${targetName}, ${selectedDistrict}, ${selectedState || 'Tamil Nadu'}, India`,
        { center: fallbackDistrictView.center, zoom: 13 }
      )
    }
    if (map && coords) {
      markProgrammaticZoom(1300)
      map.flyTo(coords.center, coords.zoom, { duration: 1.0, easeLinearity: 0.25 })
    }

    // Fetch villages and all plots in this taluk (so individual plot pins show immediately)
    try {
      if (talukObj.id && typeof talukObj.id === 'string' && talukObj.id.includes('-')) {
        const [vList, tPlots] = await Promise.all([
          getChildren(talukObj.id).catch(() => []),
          getPlots(talukObj.id).catch(() => []),
        ])
        setVillagesList(vList)
        setPlots(tPlots)
        if (vList.length > 0) {
          setSelectedVillage('__ALL__')
          setSelectedVillageNode(null)
        } else {
          setSelectedVillage('')
          setSelectedVillageNode(null)
        }
      } else {
        setVillagesList([])
        setPlots([])
        setSelectedVillage('')
        setSelectedVillageNode(null)
      }
    } catch (e) {
      console.error('Error fetching villages/plots for taluk:', e)
      setVillagesList([])
      setPlots([])
      setSelectedVillage('')
      setSelectedVillageNode(null)
    }

    const startTime = Date.now()
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      setCurrentStep('VILLAGE')
      setIsBlurOverlayVisible(true)
      if (map) map.invalidateSize()
    }

    const timer = setTimeout(finish, 1100)

    if (map) {
      const onMoveEnd = () => {
        const elapsed = Date.now() - startTime
        if (elapsed < 800) {
          map.once('moveend', onMoveEnd)
          return
        }
        finish()
      }
      map.once('moveend', onMoveEnd)
    } else {
      finish()
    }
  }

  async function handleSelectVillage(villageName) {
    const targetName = villageName !== undefined ? villageName : selectedVillage
    const isAllTaluk = !targetName || targetName === '__ALL__'
    const vObj = isAllTaluk
      ? null
      : (villagesList.find(v => v.name === targetName || v.id === targetName) || selectedVillageNode)
    setSelectedVillage(isAllTaluk ? '' : (vObj?.name || targetName))
    setSelectedVillageNode(vObj)

    setIsBlurOverlayVisible(false)
    setCurrentStep('PANNING_VILLAGE')

    setLoading(true)
    try {
      const targetId = vObj?.id || selectedTalukNode?.id || activeDistrictId
      if (targetId) {
        const pList = await getPlots(targetId)
        const villagePlots = (vObj?.id && vObj?.level === 'VILLAGE')
          ? pList.filter(p => !p.geo_node_id || p.geo_node_id === vObj.id)
          : pList
        setPlots(villagePlots)

        const map = mapInstanceRef.current
        if (map && villagePlots.length > 0) {
          markProgrammaticZoom(1300)
          const pts = villagePlots.filter(p => p.lat != null && p.lon != null).map(p => [p.lat, p.lon])
          if (pts.length === 1) {
            map.flyTo(pts[0], 16, { duration: 1.0, easeLinearity: 0.25 })
          } else if (pts.length > 1) {
            map.flyToBounds(L.latLngBounds(pts), { padding: [80, 80], maxZoom: 16, duration: 1.0 })
          }
        } else if (map && !isAllTaluk && VILLAGE_COORDS[targetName]) {
          markProgrammaticZoom(1300)
          map.flyTo(VILLAGE_COORDS[targetName].center, VILLAGE_COORDS[targetName].zoom, { duration: 1.0, easeLinearity: 0.25 })
        } else if (map && !isAllTaluk && targetName) {
          const fallbackTaluk = getTalukCenter(selectedDistrict, selectedTaluk)
          const geoView = await resolveGeocodeFallback(
            `${targetName}, ${selectedTaluk}, ${selectedDistrict}, ${selectedState || 'Tamil Nadu'}`,
            fallbackTaluk ? { center: fallbackTaluk.center, zoom: 14 } : null
          )
          if (geoView) {
            markProgrammaticZoom(1300)
            map.flyTo(geoView.center, 14.5, { duration: 1.0, easeLinearity: 0.25 })
          }
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load parcels.')
    } finally {
      setLoading(false)
    }

    const timer = setTimeout(() => {
      setCurrentStep('READY')
      setIsBlurOverlayVisible(true)
      const map = mapInstanceRef.current
      if (map) map.invalidateSize()
    }, 1050)
    const map = mapInstanceRef.current
    if (map) {
      map.once('moveend', () => {
        clearTimeout(timer)
        setCurrentStep('READY')
        setIsBlurOverlayVisible(true)
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
      setSelectedPlot(null)
      setSelectedVillageNode(null)
      setSelectedVillage('__ALL__')
      setCurrentStep('VILLAGE')
      setIsBlurOverlayVisible(true)
      if (selectedTalukNode?.id && typeof selectedTalukNode.id === 'string' && selectedTalukNode.id.includes('-')) {
        getPlots(selectedTalukNode.id).then(setPlots).catch(() => {})
      }
      const tCoords = getTalukCenter(selectedDistrict, selectedTaluk) || getDistrictCenter(selectedDistrict)
      if (map && tCoords) {
        markProgrammaticZoom(1300)
        map.flyTo(tCoords.center, tCoords.zoom, { duration: 1.0 })
      }
      return
    }

    if (currentStep === 'VILLAGE') {
      setCurrentStep('TALUK')
      setIsBlurOverlayVisible(true)
      setPlots([])
      const dCoords = getDistrictCenter(selectedDistrict) || { center: CBE_BOUNDS.getCenter(), zoom: 10.5 }
      if (map) {
        markProgrammaticZoom(1300)
        map.flyTo(dCoords.center, dCoords.zoom, { duration: 1.0 })
      }
      return
    }

    if (currentStep === 'TALUK') {
      setCurrentStep('DISTRICT')
      setIsBlurOverlayVisible(true)
      const stateView = getStateCenter(selectedState) || TN_VIEW
      if (map) {
        markProgrammaticZoom(1300)
        map.flyTo(stateView.center, stateView.zoom, { duration: 1.0 })
      }
      return
    }

    if (currentStep === 'DISTRICT') {
      setCurrentStep('STATE')
      setIsBlurOverlayVisible(true)
      if (map) {
        markProgrammaticZoom(1300)
        map.flyTo(INDIA_VIEW.center, INDIA_VIEW.zoom, { duration: 1.0 })
      }
      return
    }

    if (currentStep === 'STATE') {
      setCurrentStep('REGION')
      setIsBlurOverlayVisible(true)
      if (map) {
        markProgrammaticZoom(1300)
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
      const displayLocation = selectedVillage || selectedTaluk || selectedDistrict || (activeNode ? activeNode.name : 'Land Parcels')
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span className="header-center-title">
            {displayLocation} — Land Parcels
          </span>
          {loading && <span className="spinner" />}
        </div>
      )
    }

    if (currentStep === 'VILLAGE' || currentStep === 'PANNING_VILLAGE') {
      return (
        <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          {selectedDistrict} › {selectedTaluk || 'Taluk'} › Select Town / Village
        </span>
      )
    }

    if (currentStep === 'TALUK' || currentStep === 'PANNING_TALUK') {
      return (
        <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          {selectedDistrict} › Select Taluk
        </span>
      )
    }

    if (currentStep === 'DISTRICT' || currentStep === 'PANNING_CBE') {
      return (
        <span className="header-center-title" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          {selectedState} › Select District
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

  // ── Render Polygons & Clustered Pins ─────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // ALWAYS clean up prior layers & cluster group from map first, even if plots is empty
    if (clusterGroupRef.current) {
      if (map.hasLayer(clusterGroupRef.current)) {
        map.removeLayer(clusterGroupRef.current)
      }
      clusterGroupRef.current.clearLayers()
      clusterGroupRef.current = null
    }
    layersRef.current.forEach(({ layer, labelMarker }) => {
      if (map.hasLayer(layer)) map.removeLayer(layer)
      if (labelMarker && map.hasLayer(labelMarker)) map.removeLayer(labelMarker)
    })
    layersRef.current = []

    if (plots.length === 0) return

    // Strictly display only plots of the currently selected town/village (or entire taluk if All Villages)
    const isPlotView = currentStep === 'READY' || currentStep === 'VILLAGE'
    const plotsToRender = plots.filter(plot => {
      if (selectedVillageNode?.id && plot.geo_node_id) {
        return plot.geo_node_id === selectedVillageNode.id
      }
      return true
    })

    const clusterGroup = new MarkerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 45,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 14,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        const sizeClass = count < 10 ? 'small' : count < 50 ? 'medium' : 'large'
        return L.divIcon({
          html: `<div class="parcel-cluster-badge parcel-cluster-${sizeClass}"><span>${count}</span></div>`,
          className: 'parcel-cluster-wrapper',
          iconSize: L.point(36, 36),
        })
      },
    })

    const pinIcon = L.divIcon({
      className: 'parcel-pin-wrapper',
      html: `<svg width="24" height="30" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
        <path d="M12 0C5.37258 0 0 5.37258 0 12C0 20.25 12 30 12 30C12 30 24 20.25 24 12C24 5.37258 18.6274 0 12 0Z" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
        <circle cx="12" cy="11.5" r="4" fill="#ffffff"/>
      </svg>`,
      iconSize: [24, 30],
      iconAnchor: [12, 30],
    })

    const pinMarkers = []

    plotsToRender.forEach(plot => {
      if (!plot.boundary_geojson) return

      const geoLayer = L.geoJSON(plot.boundary_geojson, {
        style: PARCEL_STYLE,
        renderer: canvasRendererRef.current || undefined,
      })
      if (isPlotView) {
        geoLayer.addTo(map)
      }

      // Compute center for label & pin
      const bounds = geoLayer.getBounds()
      const centerPos = (plot.lat != null && plot.lon != null)
        ? L.latLng(plot.lat, plot.lon)
        : bounds.getCenter()

      // Lightweight pin marker for zoomed-out / clustered view
      const pinMarker = L.marker(centerPos, { icon: pinIcon })
      const tooltipText = `${plot.plot_number || 'Parcel'}${plot.property_name ? ` — ${plot.property_name}` : ''}`
      pinMarker.bindTooltip(tooltipText, { direction: 'top', offset: [0, -26] })
      pinMarker.on('click', (e) => {
        if (e) L.DomEvent.stopPropagation(e)
        handleSelectPlot(plot, geoLayer, bounds)
      })
      pinMarkers.push(pinMarker)

      // Create a label marker (DivIcon) — toggled by zoom
      const labelMarker = L.marker(bounds.getCenter(), {
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
      geoLayer.on('click', (e) => {
        if (e) L.DomEvent.stopPropagation(e)
        handleSelectPlot(plot, geoLayer, bounds)
      })

      layersRef.current.push({ layer: geoLayer, labelMarker, plot })
    })

    if (pinMarkers.length > 0) {
      clusterGroup.addLayers(pinMarkers)
    }
    clusterGroupRef.current = clusterGroup

    // Zoom-tiered visibility:
    //   zoom < 14  -> show clustered parcel pins
    //   zoom >= 14 -> hide pins & show parcel labels
    function updateLabels() {
      const zoom = map.getZoom()
      const showClusterPins = isPlotView && zoom < 14

      if (clusterGroupRef.current) {
        if (showClusterPins) {
          if (!map.hasLayer(clusterGroupRef.current)) {
            clusterGroupRef.current.addTo(map)
          }
        } else if (map.hasLayer(clusterGroupRef.current)) {
          map.removeLayer(clusterGroupRef.current)
        }
      }

      layersRef.current.forEach(({ labelMarker, plot }) => {
        if (selectedPlotRef.current?.id === plot.id) {
          if (map.hasLayer(labelMarker)) map.removeLayer(labelMarker)
          return
        }
        if (isPlotView && zoom >= 14) {
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
      if (clusterGroupRef.current) {
        if (map.hasLayer(clusterGroupRef.current)) {
          map.removeLayer(clusterGroupRef.current)
        }
        clusterGroupRef.current.clearLayers()
        clusterGroupRef.current = null
      }
    }
  }, [plots, currentStep])

  function handleSelectPlotFromList(plot) {
    const item = layersRef.current.find(l => l.plot.id === plot.id)
    if (!item) return
    handleSelectPlot(plot, item.layer, item.layer.getBounds())
  }

  async function handleSelectPlot(plot, geoLayer, bounds) {
    selectedPlotRef.current = plot
    if (currentStep !== 'READY') {
      setCurrentStep('READY')
      setIsBlurOverlayVisible(true)
    }

    // Hide tiny center label for this plot while modal is open
    const currentItem = layersRef.current.find(l => l.plot.id === plot.id)
    if (currentItem?.labelMarker && mapInstanceRef.current?.hasLayer(currentItem.labelMarker)) {
      mapInstanceRef.current.removeLayer(currentItem.labelMarker)
    }

    // Reset previous selected
    if (selectedLayerRef.current) {
      selectedLayerRef.current.layer.setStyle(PARCEL_STYLE)
    }

    geoLayer.setStyle(PARCEL_SELECTED_STYLE)
    selectedLayerRef.current = { layer: geoLayer }

    setSelectedPlot(plot)
    setIsPinned(false)
    setFloatingPos(prev => {
      const defaultX = window.innerWidth >= 840 ? 405 : 16
      const defaultY = window.innerWidth >= 840 ? 84 : 300
      return {
        x: Math.max(10, Math.min(window.innerWidth - 390, prev.x || defaultX)),
        y: Math.max(70, Math.min(window.innerHeight - 100, prev.y || defaultY)),
      }
    })
    setAddressViewMode('db')

    const map = mapInstanceRef.current
    if (map) {
      markProgrammaticZoom(1500)
      if (flyToSafetyTimerRef.current) {
        clearTimeout(flyToSafetyTimerRef.current)
        flyToSafetyTimerRef.current = null
      }

      // Stop any prior animation cleanly
      map.stop()

      const container = map.getContainer()
      if (container) {
        container.style.pointerEvents = 'none'
      }
      map.dragging?.disable()
      map.touchZoom?.disable()
      map.doubleClickZoom?.disable()
      map.scrollWheelZoom?.disable()
      map.boxZoom?.disable()
      map.keyboard?.disable()

      // Smart zoom & framing: avoid over-zooming on small parcels
      let targetZoom = 17.5
      if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
        const boundsZoom = map.getBoundsZoom(bounds)
        // Keep zoom between 16 and 17.5 so small parcels don't over-zoom to pixelated emptiness
        targetZoom = Math.min(17.5, Math.max(16, boundsZoom - 0.5))
      }

      const center = bounds.getCenter()
      const centerPoint = map.project(center, targetZoom)

      // Calculate vertical offset: shift target center upwards in projected coordinates
      // so the parcel center lands in the lower-middle portion of the screen (~20-25% below center)
      // leaving ample headroom for the popup card above without overflowing the top header
      const vOffset = Math.min(200, Math.round(map.getSize().y * 0.22))
      const targetPoint = centerPoint.subtract([0, vOffset])
      const targetCenter = map.unproject(targetPoint, targetZoom)

      map.flyTo(targetCenter, targetZoom, {
        animate: true,
        duration: 1.1
      })

      const onEnd = () => {
        if (container) {
          container.style.pointerEvents = ''
        }
        map.dragging?.enable()
        map.touchZoom?.enable()
        map.doubleClickZoom?.enable()
        map.scrollWheelZoom?.enable()
        map.boxZoom?.enable()
        map.keyboard?.enable()
        map.off('moveend', onEnd)
        if (flyToSafetyTimerRef.current) {
          clearTimeout(flyToSafetyTimerRef.current)
          flyToSafetyTimerRef.current = null
        }
      }

      flyToSafetyTimerRef.current = setTimeout(onEnd, 1400)
      map.once('moveend', onEnd)
    }

    // Fetch full detail (with documents)
    try {
      const detail = await getPlot(plot.id)
      setSelectedPlot(detail)
    } catch {
      // Keep the basic list item if detail fetch fails
    }
  }

  function handleClosePanel() {
    selectedPlotRef.current = null
    setSelectedPlot(null)
    setIsPinned(false)
    setPinnedPos({ x: 0, y: 0, placement: 'top' })
    clearRouteAndNearby()
    if (selectedLayerRef.current) {
      selectedLayerRef.current.layer.setStyle(PARCEL_STYLE)
      selectedLayerRef.current = null
    }
    const map = mapInstanceRef.current
    if (map) {
      const zoom = map.getZoom()
      if (currentStep === 'READY' && zoom >= 14) {
        layersRef.current.forEach(({ labelMarker }) => {
          if (!map.hasLayer(labelMarker)) labelMarker.addTo(map)
        })
      }
      const container = map.getContainer()
      if (container) container.style.pointerEvents = ''
      map.dragging?.enable()
      map.touchZoom?.enable()
      map.doubleClickZoom?.enable()
      map.scrollWheelZoom?.enable()
      map.boxZoom?.enable()
      map.keyboard?.enable()
      if (flyToSafetyTimerRef.current) {
        clearTimeout(flyToSafetyTimerRef.current)
        flyToSafetyTimerRef.current = null
      }
    }
  }

  // ── PDF Preview & Download ───────────────────────────────────────────
  async function handlePreviewPdf(doc) {
    try {
      const { url } = await getDocumentUrl(doc.id, false)
      setPdfModal({ url, docType: doc.doc_type })
    } catch {
      alert('Failed to get document URL.')
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleDownloadPdf(doc) {
    try {
      let downloadUrl = ''
      let filename = getOriginalFilename(doc.storage_key, doc.doc_type, doc.isDefaultKml)

      if (doc.isDefaultKml || doc.doc_type === 'SOURCE_KML' || doc.doc_type === 'KML') {
        const res = await getPlotKmlUrl(selectedPlot.id)
        downloadUrl = res.url
        if (res.filename) filename = res.filename
      } else {
        const res = await getDocumentUrl(doc.id, true)
        downloadUrl = res.url
        if (res.filename) filename = res.filename
      }

      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
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
      
      const addressMarker = L.marker([addrLat, addrLng], { title: inputAddress }).bindPopup(
        `<div style="font-family: inherit; font-size: 13px; font-weight: 600;">${inputAddress}</div>`
      )
      
      const featureGroup = L.featureGroup([geojsonLayer, addressMarker])
      featureGroup.addTo(mapInstanceRef.current)
      routeLayerRef.current = featureGroup
      
      mapInstanceRef.current.fitBounds(featureGroup.getBounds().extend([pLat, pLng]), { padding: [50, 50] })
      
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
      const rawElements = res.elements || []
      const elements = rawElements.filter(el => {
        if (el.lat == null || el.lon == null) return false
        const d = L.latLng(el.lat, el.lon).distanceTo(L.latLng(selectedPlot.lat, selectedPlot.lon))
        return d <= radiusToUse
      }).sort((a, b) => {
        const dA = L.latLng(a.lat, a.lon).distanceTo(L.latLng(selectedPlot.lat, selectedPlot.lon))
        const dB = L.latLng(b.lat, b.lon).distanceTo(L.latLng(selectedPlot.lat, selectedPlot.lon))
        return dA - dB
      })
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
        
        const bounds = group.getBounds().extend([selectedPlot.lat, selectedPlot.lon])
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] })
      }
      
    } catch (err) {
      console.error(err)
      setNearbyError('Failed to fetch nearby places.')
    } finally {
      setIsFetchingNearby(false)
    }
  }

  const filteredPlots = plots.filter(plot => {
    if (selectedVillageNode?.id && plot.geo_node_id && plot.geo_node_id !== selectedVillageNode.id) {
      return false
    }
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    const pNum = (plot.plot_number || '').toLowerCase()
    const pName = (plot.property_name || '').toLowerCase()
    const pLoc = (plot.location_name || '').toLowerCase()
    const pLandmark = (plot.landmark || '').toLowerCase()
    const pOwner = (plot.owner_name || '').toLowerCase()
    return pNum.includes(q) || pName.includes(q) || pLoc.includes(q) || pLandmark.includes(q) || pOwner.includes(q)
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
          className="map-container"
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
                  <span>Parcels in {selectedVillage || 'Region'}</span>
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

        {/* Global Area Measure Tool */}
        {currentStep === 'READY' && (
          <div style={{ position: 'absolute', bottom: 30, left: 30, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              onClick={() => {
                 const newVal = !isGlobalMeasure
                 setIsGlobalMeasure(newVal)
                 if (!newVal) {
                   globalMeasurePointsRef.current = []
                   globalPolygonsRef.current = []
                   updateGlobalMeasurePolygon(mapInstanceRef.current)
                 }
              }}
              className="btn"
              style={{
                background: isGlobalMeasure ? '#f59e0b' : '#fff',
                color: isGlobalMeasure ? '#fff' : '#333',
                border: '1px solid #f59e0b',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <Ruler size={18} />
              {isGlobalMeasure ? 'Cancel Measuring' : 'Draw Area'}
            </button>
            {isGlobalMeasure && (
              <div style={{ background: '#fff', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid var(--color-border)', color: 'var(--color-text)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <strong>Click</strong> on map to draw points.<br/>
                  <strong>Right-click</strong> to undo points or shapes.
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontWeight: '600' }}>Units:</span>
                  <select 
                    value={globalAreaUnit} 
                    onChange={(e) => setGlobalAreaUnit(e.target.value)}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', height: 'auto', flex: 1, borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="sqm">Sq. Meters</option>
                    <option value="hectares">Hectares</option>
                    <option value="acres">Acres</option>
                    <option value="sqft">Sq. Feet</option>
                  </select>
                </div>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                  <input 
                    type="checkbox" 
                    checked={isFreehandMeasure}
                    onChange={(e) => setIsFreehandMeasure(e.target.checked)}
                    style={{ accentColor: '#f59e0b', width: '16px', height: '16px' }}
                  />
                  <span style={{ fontWeight: '500' }}>Freehand Draw Mode</span>
                </label>
                {isFreehandMeasure && (
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '-0.2rem' }}>
                    Click & drag to draw a continuous shape.<br/>Release mouse to finish shape.
                  </div>
                )}
                {!isFreehandMeasure && globalMeasurePointsRef.current.length > 2 && (
                  <button
                    className="btn btn-primary"
                    style={{ padding: '0.4rem', fontSize: '0.8rem', justifyContent: 'center' }}
                    onClick={() => {
                       const pts = globalMeasurePointsRef.current
                       const color = POLYGON_COLORS[globalPolygonsRef.current.length % POLYGON_COLORS.length]
                       globalPolygonsRef.current.push({ points: [...pts], color })
                       globalMeasurePointsRef.current = []
                       if (mapInstanceRef.current) updateGlobalMeasurePolygon(mapInstanceRef.current)
                       setMeasureRenderTrigger(prev => prev + 1)
                    }}
                  >
                    Finish Shape
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Left Side Info Panel rendered directly (Pinned directly above plot, or Floating when Unpinned) */}
        {selectedPlot && (
          <div 
            ref={panelRef}
            className={`left-info-panel ${isPinned ? 'pinned-plot-card' : 'unpinned-floating-card'}`}
            style={isPinned ? {
              position: 'absolute',
              left: `${pinnedPos.x}px`,
              top: `${pinnedPos.y}px`,
              transform: pinnedPos.placement === 'bottom'
                ? 'translate(-50%, 16px)'
                : 'translate(-50%, -100%) translateY(-16px)',
              zIndex: 1000,
              pointerEvents: 'auto',
            } : {
              position: 'fixed',
              left: `${floatingPos.x}px`,
              top: `${floatingPos.y}px`,
              zIndex: 2000,
              boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Blue Header Bit */}
            <div 
              onMouseDown={handleHeaderMouseDown}
              style={{
                padding: '1.25rem',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                color: '#fff',
                cursor: !isPinned ? (isDragging ? 'grabbing' : 'grab') : 'default',
                userSelect: 'none'
              }}
            >
              <div>
                <div style={{ fontWeight: '700', fontSize: '1.2rem', letterSpacing: '-0.01em', lineHeight: '1.2' }}>
                  {selectedPlot.plot_number || 'Parcel'}
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '4px', fontWeight: '500', color: '#eff6ff' }}>
                  {selectedPlot.property_name || 'Unnamed Parcel'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={togglePin}
                  title={isPinned ? "Unpin card to drag freely across screen" : "Pin card to plot"}
                  style={{
                    background: isPinned ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.38)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  aria-label={isPinned ? "Unpin card" : "Pin card"}
                >
                  {isPinned ? <Pin size={16} /> : <PinOff size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMeasureMode(!isMeasureMode)
                    if (isMeasureMode) {
                      // Turning off, clear existing tools
                      if (distanceLineRef.current) mapInstanceRef.current?.removeLayer(distanceLineRef.current)
                      if (distanceMarkerRef.current) mapInstanceRef.current?.removeLayer(distanceMarkerRef.current)
                    }
                  }}
                  title={isMeasureMode ? "Turn off measure tool" : "Measure distance to plot"}
                  style={{
                    background: isMeasureMode ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)',
                    border: 'none',
                    color: isMeasureMode ? '#1d4ed8' : '#fff',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  aria-label="Measure mode"
                >
                  <Ruler size={16} />
                </button>
                <button
                  type="button"
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
                    Uploaded Documents
                  </label>
                </div>

                {(() => {
                  const plotDocs = [...(selectedPlot.documents || [])]

                  // KML File must always be available to download.
                  const hasKml = plotDocs.some(d => d.doc_type === 'SOURCE_KML' || d.doc_type === 'KML')
                  if (!hasKml) {
                    plotDocs.push({
                      id: `default-kml-${selectedPlot.id}`,
                      doc_type: 'SOURCE_KML',
                      storage_key: selectedPlot.source_file_key || `kml/${selectedPlot.id}.kml`,
                      isDefaultKml: true
                    })
                  }

                  if (plotDocs.length === 0) {
                    return (
                      <div style={{ padding: '0.75rem 0', color: 'var(--color-text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                        No documents uploaded for this parcel.
                      </div>
                    )
                  }

                  // Group into configured categories
                  const categorized = []
                  const matchedIds = new Set()

                  DOC_CATEGORY_CONFIG.forEach(cat => {
                    const matchingDocs = plotDocs.filter(d => cat.types.includes(d.doc_type))
                    if (matchingDocs.length > 0) {
                      matchingDocs.forEach(d => matchedIds.add(d.id))
                      categorized.push({
                        key: cat.key,
                        title: cat.title,
                        color: cat.color,
                        docs: matchingDocs
                      })
                    }
                  })

                  // Any documents not in predefined categories
                  const otherDocs = plotDocs.filter(d => !matchedIds.has(d.id))
                  if (otherDocs.length > 0) {
                    categorized.push({
                      key: 'other_documents',
                      title: 'Other Documents',
                      color: '#64748b',
                      docs: otherDocs
                    })
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {categorized.map(cat => {
                        const isExpanded = expandedFolders[cat.key] !== false // Default open
                        return (
                          <div
                            key={cat.key}
                            style={{
                              background: '#f8fafc',
                              borderRadius: '10px',
                              border: '1px solid var(--color-border)',
                              overflow: 'hidden',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                          >
                            <div
                              onClick={() => toggleFolder(cat.key)}
                              style={{
                                padding: '0.6rem 0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                background: isExpanded ? '#f1f5f9' : '#f8fafc',
                                borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                                userSelect: 'none',
                                transition: 'background 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {isExpanded ? (
                                  <FolderOpen size={16} style={{ color: cat.color, flexShrink: 0 }} />
                                ) : (
                                  <Folder size={16} style={{ color: cat.color, flexShrink: 0 }} />
                                )}
                                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0f172a' }}>
                                  {cat.title}
                                </span>
                                <span style={{
                                  background: '#e0e7ff',
                                  color: '#1e40af',
                                  fontSize: '0.72rem',
                                  fontWeight: '700',
                                  padding: '1px 7px',
                                  borderRadius: '12px',
                                  border: '1px solid #c7d2fe'
                                }}>
                                  {cat.docs.length}
                                </span>
                              </div>
                              {isExpanded ? (
                                <ChevronDown size={15} color="var(--color-text-muted)" />
                              ) : (
                                <ChevronRight size={15} color="var(--color-text-muted)" />
                              )}
                            </div>

                            {isExpanded && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.5rem 0.75rem', background: '#ffffff' }}>
                                {cat.docs.map(doc => {
                                  const title = DOC_TITLES[doc.doc_type] || doc.doc_type.replace(/_/g, ' ')
                                  const filename = getOriginalFilename(doc.storage_key, doc.doc_type, doc.isDefaultKml)
                                  const isNonPdf = doc.doc_type === 'SOURCE_KML' || doc.doc_type === 'KML' || doc.doc_type === 'SHAPEFILE' || (doc.storage_key && !doc.storage_key.toLowerCase().endsWith('.pdf'))
                                  return (
                                    <div
                                      key={doc.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.35rem 0',
                                        borderBottom: '1px solid #f8fafc'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0, flex: 1, paddingRight: '0.4rem' }}>
                                        <FileText size={14} color="#64748b" style={{ flexShrink: 0 }} />
                                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                          <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {title}
                                          </div>
                                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={filename}>
                                            {filename}
                                          </div>
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                                        {!isNonPdf && (
                                          <button
                                            type="button"
                                            className="btn btn-outline btn-sm"
                                            onClick={() => handlePreviewPdf(doc)}
                                            disabled={pdfLoading}
                                            title={`Preview ${filename}`}
                                            style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem', borderRadius: '5px' }}
                                          >
                                            <Eye size={12} />
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          className="btn btn-primary btn-sm"
                                          onClick={() => handleDownloadPdf(doc)}
                                          title={`Download ${filename}`}
                                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem', borderRadius: '5px' }}
                                        >
                                          <Download size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
                
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                  <button className="btn btn-outline" style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', fontWeight: '600' }} title="View RSR">
                    RSR
                  </button>
                  <button className="btn btn-outline" style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', fontWeight: '600' }} title="View Master Plan">
                    Master Plan
                  </button>
                </div>
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
                      <div 
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', marginTop: '0.25rem' }}
                      >
                        {isGeocoding ? (
                          <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>Searching...</div>
                        ) : geocodeResults.length > 0 ? (
                          geocodeResults.map((item, idx) => (
                            <div 
                              key={idx} 
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSelectSuggestion(item)
                              }}
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
                          {routeData.distance > 1000 ? (routeData.distance / 1000).toFixed(1) + ' km' : Math.round(routeData.distance) + ' m'}
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
                    {['Hospital', 'School', 'Restaurant', 'Park', 'Supermarket', 'Pharmacy', 'Bank'].map(cat => (
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

        {/* Top-Left Non-Blocking Selection Card (no map blur) */}
        {isBlurOverlayVisible && (
          <div className="map-floating-nav-container">
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
                    </span>
                    <ChevronRight size={18} style={{ color: 'var(--color-primary)' }} />
                  </button>
                  <button
                    className="selection-option-btn"
                    onClick={() => {}}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      <img src="/globe-small.png" alt="Overseas" className="selection-option-img" />
                      <span style={{ fontWeight: '600' }}>Overseas</span>
                    </span>
                    <ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} />
                  </button>
                </div>
              </div>
            )}

            {currentStep === 'STATE' && (() => {
              const stateOptions = states.length > 0
                ? states.map(s => s.name)
                : INDIA_STATES
              return (
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
                      {stateOptions.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }}
                    onClick={() => handleSelectState(selectedState)}
                    disabled={!selectedState}
                  >
                    Continue to District →
                  </button>
                </div>
              )
            })()}

            {currentStep === 'DISTRICT' && (() => {
              const districtOptions = districts.length > 0
                ? districts.map(d => d.name)
                : (selectedState === 'Tamil Nadu' ? TN_DISTRICTS : [])
              return (
                <div className="map-selection-card">
                  <div className="map-selection-header">
                    <div className="map-selection-icon">
                      <img src="/tamil-nadu.png" alt={selectedState} />
                    </div>
                    <h2 className="map-selection-title">Select District</h2>
                    <p className="map-selection-subtitle">{selectedState} • Choose district to view its taluks</p>
                  </div>
                  <div className="selection-dropdown-wrapper">
                    <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>District</label>
                    {districtOptions.length === 0 ? (
                      <p style={{ color: 'var(--color-text-muted)', margin: '0.5rem 0' }}>
                        No districts registered in {selectedState} yet.
                      </p>
                    ) : (
                      <select
                        className="selection-select"
                        value={selectedDistrict}
                        onChange={e => setSelectedDistrict(e.target.value)}
                      >
                        {districtOptions.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }}
                    onClick={() => handleSelectDistrict(selectedDistrict)}
                    disabled={districtOptions.length === 0 || !selectedDistrict}
                  >
                    Continue to Taluk →
                  </button>
                </div>
              )
            })()}

            {currentStep === 'TALUK' && (
              <div className="map-selection-card">
                <div className="map-selection-header">
                  <div className="map-selection-icon">
                    <img src="/tamil-nadu.png" alt="Taluk" />
                  </div>
                  <h2 className="map-selection-title">Select Taluk</h2>
                  <p className="map-selection-subtitle">{selectedDistrict} • Choose taluk to view towns / villages</p>
                </div>
                <div className="selection-dropdown-wrapper">
                  <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>Taluk</label>
                  {taluksList.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', margin: '0.5rem 0' }}>No taluks registered in this district.</p>
                  ) : (
                    <select
                      className="selection-select"
                      value={selectedTaluk}
                      onChange={e => setSelectedTaluk(e.target.value)}
                    >
                      {taluksList.map(t => (
                        <option key={t.id || t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }}
                  onClick={() => handleSelectTaluk(selectedTaluk)}
                  disabled={taluksList.length === 0 || !selectedTaluk}
                >
                  Continue to Town / Village →
                </button>
              </div>
            )}

            {(currentStep === 'VILLAGE' || currentStep === 'READY') && (
              <div className="map-selection-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isNavCardCollapsed ? 0 : '0.75rem' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      const map = mapInstanceRef.current
                      setSelectedPlot(null)
                      setSelectedVillageNode(null)
                      setPlots([])
                      setCurrentStep('TALUK')
                      setIsBlurOverlayVisible(true)
                      const dCoords = getDistrictCenter(selectedDistrict) || { center: CBE_BOUNDS.getCenter(), zoom: 10.5 }
                      if (map) {
                        markProgrammaticZoom(1300)
                        map.flyTo(dCoords.center, dCoords.zoom, { duration: 1.0 })
                      }
                    }}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                    title="Back to Taluk selection"
                  >
                    ← Taluk
                  </button>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--color-text-muted)' }}>
                    {selectedTaluk || 'Navigation'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setIsNavCardCollapsed(c => !c)}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                    title={isNavCardCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                  >
                    {isNavCardCollapsed ? '+' : '−'}
                  </button>
                </div>

                {!isNavCardCollapsed && (
                  <>
                    <div className="map-selection-header">
                      <div className="map-selection-icon">
                        <img src="/tamil-nadu.png" alt="Town / Village" />
                      </div>
                      <h2 className="map-selection-title">Explore Parcels</h2>
                      <p className="map-selection-subtitle">{selectedTaluk || 'Taluk'} • Switch town / village or view all taluk parcels</p>
                    </div>
                    <div className="selection-dropdown-wrapper">
                      <label className="form-label" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>Town / Village</label>
                      {villagesList.length === 0 ? (
                        <p style={{ color: 'var(--color-text-muted)', margin: '0.5rem 0' }}>No towns / villages registered in this taluk.</p>
                      ) : (
                        <select
                          className="selection-select"
                          value={selectedVillage || '__ALL__'}
                          onChange={e => {
                            const val = e.target.value
                            setSelectedVillage(val)
                            if (val === '__ALL__') {
                              setSelectedVillageNode(null)
                            } else {
                              const found = villagesList.find(v => v.name === val || v.id === val)
                              if (found) setSelectedVillageNode(found)
                            }
                            if (currentStep === 'READY') {
                              handleSelectVillage(val)
                            }
                          }}
                        >
                          <option value="__ALL__">All Villages in {selectedTaluk} ({plots.length})</option>
                          {villagesList.map(v => (
                            <option key={v.id || v.name} value={v.name}>{v.name} ({v.plot_count || 0})</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button
                        className="btn btn-primary"
                        style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontWeight: '600' }}
                        onClick={() => handleSelectVillage()}
                        disabled={villagesList.length === 0 && plots.length === 0}
                      >
                        {selectedVillage === '__ALL__' || !selectedVillage ? 'Explore All Taluk Parcels →' : 'Explore Town / Village Parcels →'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
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
        .area-tooltip {
          background: rgba(0,0,0,0.7);
          border: none;
          color: #fff;
          font-weight: bold;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .parcel-cluster-wrapper {
          background: transparent;
          border: none;
        }
        .parcel-cluster-badge {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: #ffffff;
          border: 2.5px solid #ffffff;
          box-shadow: 0 3px 10px rgba(37, 99, 235, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 13px;
          transition: transform 0.15s ease;
        }
        .parcel-cluster-badge.parcel-cluster-medium {
          width: 40px;
          height: 40px;
          font-size: 14px;
        }
        .parcel-cluster-badge.parcel-cluster-large {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%);
          font-size: 14px;
        }
        .parcel-cluster-badge:hover {
          transform: scale(1.08);
        }
        .parcel-pin-wrapper {
          background: transparent;
          border: none;
        }
        .region-pin-wrapper {
          background: transparent;
          border: none;
        }
        .region-pin-badge {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          background: rgba(255, 255, 255, 0.96);
          border: 2px solid #2563eb;
          border-radius: 999px;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.3);
          color: #0f172a;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          transform: translate(-50%, -100%);
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .region-pin-badge::after {
          content: '';
          position: absolute;
          left: 50%;
          bottom: -7px;
          transform: translateX(-50%);
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 7px solid #2563eb;
        }
        .region-pin-badge:hover {
          transform: translate(-50%, -104%) scale(1.05);
          background: #eff6ff;
        }
        .region-pin-count {
          background: #2563eb;
          color: #ffffff;
          border-radius: 999px;
          padding: 1px 7px;
          font-size: 11px;
          font-weight: 700;
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
