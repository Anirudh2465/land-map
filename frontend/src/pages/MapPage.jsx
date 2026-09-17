/**
 * MapPage — satellite map showing land parcel polygons for a district.
 * Route: /map/:districtId
 *
 * Features:
 *  - Leaflet map with Esri World Imagery (satellite) tiles
 *  - All ACTIVE parcels rendered as GeoJSON polygons
 *  - Zoom-based labels: plot_number at zoom ≥ 14, property_name at zoom ≥ 16
 *  - Click a parcel → map pans to fit bounds → right info panel opens
 *  - Info panel: LandID, Name, Area, Coords, Location, Landmark, PDF buttons
 *  - PDF preview via iframe in a modal using presigned URLs
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getPlots, getPlot } from '../api/plots'
import { getDocumentUrl } from '../api/documents'
import Header from '../components/Header'

// Coimbatore district approximate bounds [SW, NE]
const CBE_BOUNDS = L.latLngBounds(
  L.latLng(10.85, 76.85),
  L.latLng(11.25, 77.25)
)

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
  const layersRef = useRef([]) // { layer, plot, labelMarker }
  const selectedLayerRef = useRef(null)

  const [plots, setPlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPlot, setSelectedPlot] = useState(null)
  const [pdfModal, setPdfModal] = useState(null) // { url, docType }
  const [pdfLoading, setPdfLoading] = useState(false)

  // ── Init Map ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInstanceRef.current) return // Already initialized

    const map = L.map(mapRef.current, {
      center: CBE_BOUNDS.getCenter(),
      zoom: 11,
      maxZoom: 22,
      zoomControl: true,
    })

    // Esri World Imagery (satellite)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles © Esri',
        maxNativeZoom: 18,
        maxZoom: 22,
      }
    ).addTo(map)

    // Esri World Boundaries and Places (labels + roads)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        maxNativeZoom: 18,
        maxZoom: 22,
      }
    ).addTo(map)

    // Fit to Coimbatore bounds on load
    map.fitBounds(CBE_BOUNDS, { padding: [20, 20] })

    mapInstanceRef.current = map

    // Cleanup on unmount
    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // ── Load Plots ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!districtId) return
    setLoading(true)
    getPlots(districtId)
      .then(setPlots)
      .catch(err => setError(err.response?.data?.detail || 'Failed to load parcels.'))
      .finally(() => setLoading(false))
  }, [districtId])

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
      }).addTo(map)

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
        if (zoom >= 14) {
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
  }, [plots])

  // ── Select a Parcel ──────────────────────────────────────────────────
  async function handleSelectPlot(plot, geoLayer, bounds) {
    // Reset previous selected
    if (selectedLayerRef.current) {
      selectedLayerRef.current.layer.setStyle(PARCEL_STYLE)
    }

    geoLayer.setStyle(PARCEL_SELECTED_STYLE)
    selectedLayerRef.current = { layer: geoLayer }

    setSelectedPlot(plot)

    // Wait for React to render the panel and physically resize the map container
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize()
        // Use flyTo for a guaranteed center zoom, instead of fitBounds which can fail if bounds are too small
        mapInstanceRef.current.flyTo(bounds.getCenter(), 20, {
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
    if (selectedLayerRef.current) {
      selectedLayerRef.current.layer.setStyle(PARCEL_STYLE)
      selectedLayerRef.current = null
    }
    setSelectedPlot(null)
  }

  // ── PDF Preview ───────────────────────────────────────────────────────
  async function handlePreviewPdf(doc) {
    setPdfLoading(true)
    try {
      const { url } = await getDocumentUrl(doc.id)
      setPdfModal({ url, docType: doc.doc_type })
    } catch {
      alert('Failed to load document URL.')
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleDownloadPdf(doc) {
    try {
      const { url } = await getDocumentUrl(doc.id)
      const a = document.createElement('a')
      a.href = url
      a.download = `${selectedPlot.plot_number}_${doc.doc_type}.pdf`
      a.click()
    } catch {
      alert('Failed to generate download link.')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header />

      {/* Top bar */}
      <div style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.5rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        fontSize: '0.875rem',
        color: 'var(--color-text-muted)',
      }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
        <span>Coimbatore District — Land Parcels</span>
        {loading && <span className="spinner" />}
        {!loading && (
          <span className="badge badge-blue">{plots.filter(p => p.boundary_geojson).length} parcels</span>
        )}
      </div>

      {/* Map + Panel */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* Map */}
        <div
          ref={mapRef}
          style={{ flex: 1, height: '100%' }}
        />

        {/* Info Panel */}
        {selectedPlot && (
          <div style={{
            width: '360px',
            flexShrink: 0,
            background: 'var(--color-surface)',
            borderLeft: '1px solid var(--color-border)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Panel Header */}
            <div style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-primary)',
              color: '#fff',
            }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>
                  {selectedPlot.plot_number || 'Parcel'}
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                  {selectedPlot.property_name || 'Unnamed Parcel'}
                </div>
              </div>
              <button
                onClick={handleClosePanel}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Close panel"
              >
                ×
              </button>
            </div>

            {/* Panel Body */}
            <div style={{ padding: '1.25rem', flex: 1 }}>
              <InfoRow label="Land ID" value={selectedPlot.plot_number} />
              <InfoRow label="Land Name" value={selectedPlot.property_name} />
              <InfoRow
                label="Area"
                value={selectedPlot.area_value
                  ? `${Number(selectedPlot.area_value).toLocaleString()} ${selectedPlot.area_unit || 'sqm'}`
                  : null}
              />
              <InfoRow
                label="Coordinates"
                value={selectedPlot.lat && selectedPlot.lon
                  ? `${selectedPlot.lat.toFixed(6)}, ${selectedPlot.lon.toFixed(6)}`
                  : null}
              />
              <InfoRow label="Location" value={selectedPlot.location_name} />
              <InfoRow label="Landmark" value={selectedPlot.landmark || '—'} />

              {/* Documents */}
              {selectedPlot.documents && selectedPlot.documents.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '0.75rem',
                  }}>
                    Documents
                  </div>
                  {selectedPlot.documents.map(doc => (
                    <div key={doc.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.75rem',
                      background: 'var(--color-bg)',
                      borderRadius: 'var(--radius)',
                      marginBottom: '0.5rem',
                      border: '1px solid var(--color-border)',
                    }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                        📄 {doc.doc_type}
                      </span>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handlePreviewPdf(doc)}
                          disabled={pdfLoading}
                        >
                          Preview
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleDownloadPdf(doc)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(!selectedPlot.documents || selectedPlot.documents.length === 0) && (
                <div style={{
                  marginTop: '1.25rem',
                  padding: '1rem',
                  background: 'var(--color-bg)',
                  borderRadius: 'var(--radius)',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                  fontSize: '0.875rem',
                }}>
                  No documents uploaded yet.
                </div>
              )}
            </div>
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
              <span className="modal-title">
                📄 {pdfModal.docType} Document
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
  if (!value) return null
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.15rem',
      marginBottom: '0.9rem',
    }}>
      <span style={{
        fontSize: '0.72rem',
        fontWeight: '600',
        color: 'var(--color-text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {label}
      </span>
      <span style={{ fontSize: '0.9rem', color: 'var(--color-text)', wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  )
}
