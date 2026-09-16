import uuid
import json
import httpx
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping

from database import get_db
from models import Plot, Document, GeoNode
from auth.dependencies import require_admin
from minio_client import upload_file
from kml_parser import extract_polygon_from_kml
from plots.schemas import PlotListItem, PlotDetail, DocumentOut

router = APIRouter(prefix="/plots", tags=["plots"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _geometry_to_geojson(geom) -> Optional[dict]:
    """Convert a PostGIS/GeoAlchemy2 geometry column value to a GeoJSON dict."""
    if geom is None:
        return None
    try:
        shape = to_shape(geom)
        return mapping(shape)
    except Exception:
        return None


def _plot_to_list_item(plot: Plot) -> PlotListItem:
    docs = [DocumentOut(id=d.id, doc_type=d.doc_type, storage_key=d.storage_key) for d in plot.documents]
    return PlotListItem(
        id=plot.id,
        plot_number=plot.plot_number,
        property_name=plot.property_name,
        area_value=float(plot.area_value) if plot.area_value is not None else None,
        area_unit=plot.area_unit,
        lat=plot.lat,
        lon=plot.lon,
        location_name=plot.location_name,
        landmark=plot.landmark,
        boundary_geojson=_geometry_to_geojson(plot.boundary),
        documents=docs,
    )


def _plot_to_detail(plot: Plot) -> PlotDetail:
    docs = [DocumentOut(id=d.id, doc_type=d.doc_type, storage_key=d.storage_key) for d in plot.documents]
    return PlotDetail(
        id=plot.id,
        plot_number=plot.plot_number,
        property_name=plot.property_name,
        area_value=float(plot.area_value) if plot.area_value is not None else None,
        area_unit=plot.area_unit,
        lat=plot.lat,
        lon=plot.lon,
        location_name=plot.location_name,
        landmark=plot.landmark,
        boundary_geojson=_geometry_to_geojson(plot.boundary),
        survey_number=plot.survey_number,
        classification=plot.classification,
        status=plot.status,
        created_at=plot.created_at,
        documents=docs,
    )


async def _reverse_geocode(lat: float, lon: float) -> Optional[str]:
    """Call Nominatim to get a human-readable address from coordinates."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "json"},
                headers={"User-Agent": "LPMS-LandManagementSystem/1.0"},
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("display_name")
    except Exception:
        pass
    return None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[PlotListItem])
def list_plots(district_id: UUID, db: Session = Depends(get_db)):
    """List all ACTIVE plots in a district."""
    node = db.query(GeoNode).filter(GeoNode.id == district_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="District not found")
    plots = (
        db.query(Plot)
        .filter(Plot.geo_node_id == district_id, Plot.status == "ACTIVE")
        .all()
    )
    return [_plot_to_list_item(p) for p in plots]


@router.get("/{plot_id}", response_model=PlotDetail)
def get_plot(plot_id: UUID, db: Session = Depends(get_db)):
    """Get full details of a single plot."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    return _plot_to_detail(plot)


@router.post("", response_model=PlotDetail, status_code=status.HTTP_201_CREATED)
async def create_plot(
    district_id: UUID = Form(...),
    land_id: str = Form(...),
    land_name: str = Form(...),
    area_value: float = Form(...),
    area_unit: str = Form("sqm"),
    lat: float = Form(...),
    lon: float = Form(...),
    landmark: Optional[str] = Form(None),
    kml_file: UploadFile = File(...),
    fmb_file: Optional[UploadFile] = File(None),
    patta_file: Optional[UploadFile] = File(None),
    deed_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Create a new land parcel. Admin only."""
    # Validate district exists
    node = db.query(GeoNode).filter(GeoNode.id == district_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="District not found")

    # Check land_id uniqueness within district
    existing = db.query(Plot).filter(
        Plot.geo_node_id == district_id,
        Plot.plot_number == land_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"LandID '{land_id}' already exists in this district."
        )

    plot_id = uuid.uuid4()

    # ── Parse KML ────────────────────────────────────────────────────────
    kml_bytes = await kml_file.read()
    kml_key = f"kml/{plot_id}.kml"
    upload_file(kml_key, kml_bytes, content_type="application/vnd.google-earth.kml+xml")

    boundary_wkt = None
    centroid_lat, centroid_lon = lat, lon  # fallback to user-entered coords

    try:
        parsed = extract_polygon_from_kml(kml_bytes)
        boundary_wkt = parsed["wkt"]
        centroid_lat = parsed["centroid_lat"]
        centroid_lon = parsed["centroid_lon"]
    except Exception as e:
        # KML parse failure is non-fatal: plot created without geometry
        print(f"⚠️  KML parse warning for {plot_id}: {e}")

    # ── Reverse geocode ───────────────────────────────────────────────────
    location_name = await _reverse_geocode(lat, lon)

    # ── Build PostGIS geometry ────────────────────────────────────────────
    boundary_geom = None
    centroid_geom = None
    if boundary_wkt:
        from shapely import wkt as swkt
        from shapely.geometry import Point
        poly = swkt.loads(boundary_wkt)
        boundary_geom = from_shape(poly, srid=4326)
        centroid_pt = Point(centroid_lon, centroid_lat)
        centroid_geom = from_shape(centroid_pt, srid=4326)

    # ── Create plot row ───────────────────────────────────────────────────
    plot = Plot(
        id=plot_id,
        geo_node_id=district_id,
        property_name=land_name,
        plot_number=land_id,
        area_value=area_value,
        area_unit=area_unit,
        lat=lat,
        lon=lon,
        location_name=location_name,
        landmark=landmark,
        boundary=boundary_geom,
        centroid=centroid_geom,
        source_file_type="KML",
        source_file_key=kml_key,
        created_by=current_user.id,
        status="ACTIVE",
    )
    db.add(plot)
    db.flush()  # get plot.id

    # ── Upload PDFs ───────────────────────────────────────────────────────
    pdf_files = [
        ("FMB", fmb_file),
        ("PATTA", patta_file),
        ("DEED", deed_file),
    ]
    for doc_type, upload in pdf_files:
        if upload and upload.filename:
            pdf_bytes = await upload.read()
            if pdf_bytes:
                key = f"documents/{plot_id}/{doc_type}.pdf"
                upload_file(key, pdf_bytes, content_type="application/pdf")
                doc = Document(
                    id=uuid.uuid4(),
                    plot_id=plot_id,
                    doc_type=doc_type,
                    storage_key=key,
                    uploaded_by=current_user.id,
                )
                db.add(doc)

    db.commit()
    db.refresh(plot)
    return _plot_to_detail(plot)


@router.delete("/{plot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plot(
    plot_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Soft-delete a plot (sets status to DELETED). Admin only."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    plot.status = "DELETED"
    db.commit()
