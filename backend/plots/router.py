import uuid
import json
import httpx
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Response
from sqlalchemy.orm import Session
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping

from database import get_db
from models import Plot, Document, GeoNode, DocumentExtract, AISummary, Owner, Transaction, TaxRecord
from auth.dependencies import require_admin
import re
from minio_client import upload_file, get_presigned_url, get_content_type, delete_plot_storage, download_file, is_supabase_mode
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
        plot_type=plot.plot_type,
        address=plot.address,
        year_of_registration=plot.year_of_registration,
        owner_name=plot.owner_name,
        boundary_geojson=_geometry_to_geojson(plot.boundary),
        source_file_key=plot.source_file_key,
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
        plot_type=plot.plot_type,
        address=plot.address,
        year_of_registration=plot.year_of_registration,
        owner_name=plot.owner_name,
        boundary_geojson=_geometry_to_geojson(plot.boundary),
        source_file_key=plot.source_file_key,
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
def list_plots(geo_node_id: Optional[UUID] = None, district_id: Optional[UUID] = None, db: Session = Depends(get_db)):
    """List all ACTIVE plots in a geo node (village, district, etc). Accepts geo_node_id or legacy district_id."""
    node_id = geo_node_id or district_id
    if not node_id:
        raise HTTPException(status_code=400, detail="geo_node_id or district_id is required")
    node = db.query(GeoNode).filter(GeoNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="GeoNode not found")
    if node.level == 'TALUK':
        village_ids = db.query(GeoNode.id).filter(GeoNode.parent_id == node_id)
        plots = (
            db.query(Plot)
            .filter((Plot.geo_node_id == node_id) | (Plot.geo_node_id.in_(village_ids)), Plot.status == "ACTIVE")
            .all()
        )
    elif node.level == 'DISTRICT':
        taluk_ids = db.query(GeoNode.id).filter(GeoNode.parent_id == node_id)
        village_ids = db.query(GeoNode.id).filter(GeoNode.parent_id.in_(taluk_ids))
        plots = (
            db.query(Plot)
            .filter((Plot.geo_node_id == node_id) | (Plot.geo_node_id.in_(taluk_ids)) | (Plot.geo_node_id.in_(village_ids)), Plot.status == "ACTIVE")
            .all()
        )
    else:
        plots = (
            db.query(Plot)
            .filter(Plot.geo_node_id == node_id, Plot.status == "ACTIVE")
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


@router.post("/extract-kml")
async def extract_kml(
    kml_file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Parse KML and return lat, lon, and calculated area in sqm."""
    try:
        contents = await kml_file.read()
        parsed = extract_polygon_from_kml(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Calculate exact area in square meters using PostGIS geography casting
    from sqlalchemy import text
    query = text("SELECT ST_Area(ST_GeomFromText(:wkt, 4326)::geography)")
    result = db.execute(query, {"wkt": parsed["wkt"]}).scalar()
    
    return {
        "lat": parsed["centroid_lat"],
        "lon": parsed["centroid_lon"],
        "area_sqm": float(result) if result else 0.0
    }



@router.post("", response_model=PlotDetail, status_code=status.HTTP_201_CREATED)
async def create_plot(
    district_id: UUID = Form(...),
    land_id: str = Form(...),
    land_name: str = Form(...),
    landmark: Optional[str] = Form(None),
    plot_type: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    year_of_registration: Optional[str] = Form(None),
    owner_name: Optional[str] = Form(None),
    lat: Optional[float] = Form(None),
    lon: Optional[float] = Form(None),
    area_value: Optional[float] = Form(None),
    area_unit: Optional[str] = Form(None),
    kml_file: UploadFile = File(...),
    fmb_file: List[UploadFile] = File(default=[]),
    patta_file: List[UploadFile] = File(default=[]),
    deed_file: List[UploadFile] = File(default=[]),
    parent_document_file: List[UploadFile] = File(default=[]),
    ec_details_file: List[UploadFile] = File(default=[]),
    building_plan_file: List[UploadFile] = File(default=[]),
    plan_approval_letter_file: List[UploadFile] = File(default=[]),
    building_permit_letter_file: List[UploadFile] = File(default=[]),
    property_tax_file: List[UploadFile] = File(default=[]),
    aerial_photo_file: List[UploadFile] = File(default=[]),
    dispute_details_file: List[UploadFile] = File(default=[]),
    adangal_file: List[UploadFile] = File(default=[]),
    a_register_file: List[UploadFile] = File(default=[]),
    approved_plan_file: List[UploadFile] = File(default=[]),
    source_kml_file: List[UploadFile] = File(default=[]),
    shapefile_file: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Create a new land parcel. Admin only."""
    # Accept village_id or legacy district_id
    geo_node_id = district_id
    # Validate geo node exists
    node = db.query(GeoNode).filter(GeoNode.id == geo_node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="GeoNode (village/district) not found")

    # Check land_id uniqueness within geo node (only for ACTIVE plots)
    existing = db.query(Plot).filter(
        Plot.geo_node_id == geo_node_id,
        Plot.plot_number == land_id,
        Plot.status == "ACTIVE"
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"LandID '{land_id}' already exists in this area."
        )

    plot_id = uuid.uuid4()

    # ── Parse KML ────────────────────────────────────────────────────────
    kml_bytes = await kml_file.read()
    kml_key = f"kml/{plot_id}.kml"
    upload_file(kml_key, kml_bytes, content_type="application/vnd.google-earth.kml+xml")

    try:
        parsed = extract_polygon_from_kml(kml_bytes)
        boundary_wkt = parsed["wkt"]
        centroid_lat = lat if lat is not None else parsed["centroid_lat"]
        centroid_lon = lon if lon is not None else parsed["centroid_lon"]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse KML: {e}")

    # Calculate exact area in square meters using PostGIS geography casting unless overridden
    if area_value is None:
        from sqlalchemy import text
        query = text("SELECT ST_Area(ST_GeomFromText(:wkt, 4326)::geography)")
        result = db.execute(query, {"wkt": boundary_wkt}).scalar()
        final_area_value = float(result) if result else 0.0
        final_area_unit = "sqm"
    else:
        final_area_value = area_value
        final_area_unit = area_unit or "sqm"

    # ── Reverse geocode ───────────────────────────────────────────────────
    location_name = await _reverse_geocode(centroid_lat, centroid_lon)

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
        geo_node_id=geo_node_id,
        property_name=land_name,
        plot_number=land_id,
        area_value=final_area_value,
        area_unit=final_area_unit,
        lat=centroid_lat,
        lon=centroid_lon,
        location_name=location_name,
        landmark=landmark,
        plot_type=plot_type,
        address=address,
        year_of_registration=year_of_registration,
        owner_name=owner_name,
        boundary=boundary_geom,
        centroid=centroid_geom,
        source_file_type="KML",
        source_file_key=kml_key,
        created_by=current_user.id,
        status="ACTIVE",
    )
    db.add(plot)
    db.flush()  # get plot.id

    # ── Upload Documents ──────────────────────────────────────────────────
    upload_files_groups = [
        ("FMB", fmb_file, "application/pdf"),
        ("PATTA", patta_file, "application/pdf"),
        ("DEED", deed_file, "application/pdf"),
        ("PARENT_DOCUMENT", parent_document_file, "application/pdf"),
        ("EC_DETAILS", ec_details_file, "application/pdf"),
        ("BUILDING_PLAN", building_plan_file, "application/pdf"),
        ("PLAN_APPROVAL", plan_approval_letter_file, "application/pdf"),
        ("BUILDING_PERMIT", building_permit_letter_file, "application/pdf"),
        ("PROPERTY_TAX", property_tax_file, "application/pdf"),
        ("AERIAL_PHOTO", aerial_photo_file, "application/pdf"),
        ("DISPUTE_DETAILS", dispute_details_file, "application/pdf"),
        ("ADANGAL", adangal_file, "application/pdf"),
        ("A_REGISTER", a_register_file, "application/pdf"),
        ("APPROVED_PLAN", approved_plan_file, "application/pdf"),
        ("SOURCE_KML", source_kml_file, "application/vnd.google-earth.kml+xml"),
        ("SHAPEFILE", shapefile_file, "application/octet-stream"),
    ]
    for doc_type, upload_list, default_ct in upload_files_groups:
        for idx, upload in enumerate(upload_list):
            if upload and upload.filename:
                file_bytes = await upload.read()
                if file_bytes:
                    ct = get_content_type(upload.filename, fallback=upload.content_type or default_ct)
                    key = f"documents/{plot_id}/{doc_type}_{idx}_{upload.filename}"
                    upload_file(key, file_bytes, content_type=ct)
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


@router.put("/{plot_id}", response_model=PlotDetail)
async def update_plot(
    plot_id: UUID,
    land_id: str = Form(...),
    land_name: str = Form(...),
    landmark: Optional[str] = Form(None),
    plot_type: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    year_of_registration: Optional[str] = Form(None),
    owner_name: Optional[str] = Form(None),
    lat: Optional[float] = Form(None),
    lon: Optional[float] = Form(None),
    area_value: Optional[float] = Form(None),
    area_unit: Optional[str] = Form(None),
    kml_file: Optional[UploadFile] = File(None),
    fmb_file: List[UploadFile] = File(default=[]),
    patta_file: List[UploadFile] = File(default=[]),
    deed_file: List[UploadFile] = File(default=[]),
    parent_document_file: List[UploadFile] = File(default=[]),
    ec_details_file: List[UploadFile] = File(default=[]),
    building_plan_file: List[UploadFile] = File(default=[]),
    plan_approval_letter_file: List[UploadFile] = File(default=[]),
    building_permit_letter_file: List[UploadFile] = File(default=[]),
    property_tax_file: List[UploadFile] = File(default=[]),
    aerial_photo_file: List[UploadFile] = File(default=[]),
    dispute_details_file: List[UploadFile] = File(default=[]),
    adangal_file: List[UploadFile] = File(default=[]),
    a_register_file: List[UploadFile] = File(default=[]),
    approved_plan_file: List[UploadFile] = File(default=[]),
    source_kml_file: List[UploadFile] = File(default=[]),
    shapefile_file: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Update an existing land parcel and upload additional documents. Admin only."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")

    # Check land_id uniqueness within district (excluding this plot)
    existing = db.query(Plot).filter(
        Plot.geo_node_id == plot.geo_node_id,
        Plot.plot_number == land_id,
        Plot.id != plot_id,
        Plot.status == "ACTIVE"
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"LandID '{land_id}' already exists in this district."
        )

    # If new KML is uploaded, parse and update geometry
    if kml_file and kml_file.filename:
        kml_bytes = await kml_file.read()
        if kml_bytes:
            kml_key = f"kml/{plot_id}.kml"
            upload_file(kml_key, kml_bytes, content_type="application/vnd.google-earth.kml+xml")
            try:
                parsed = extract_polygon_from_kml(kml_bytes)
                boundary_wkt = parsed["wkt"]
                centroid_lat = lat if lat is not None else parsed["centroid_lat"]
                centroid_lon = lon if lon is not None else parsed["centroid_lon"]

                from shapely import wkt as swkt
                from shapely.geometry import Point
                poly = swkt.loads(boundary_wkt)
                plot.boundary = from_shape(poly, srid=4326)
                centroid_pt = Point(centroid_lon, centroid_lat)
                plot.centroid = from_shape(centroid_pt, srid=4326)
                plot.lat = centroid_lat
                plot.lon = centroid_lon
                plot.source_file_key = kml_key

                if area_value is None:
                    from sqlalchemy import text
                    query = text("SELECT ST_Area(ST_GeomFromText(:wkt, 4326)::geography)")
                    result = db.execute(query, {"wkt": boundary_wkt}).scalar()
                    plot.area_value = float(result) if result else 0.0
                    plot.area_unit = "sqm"

                loc_name = await _reverse_geocode(centroid_lat, centroid_lon)
                if loc_name:
                    plot.location_name = loc_name
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to parse KML: {e}")

    # Update basic fields
    plot.plot_number = land_id.strip()
    plot.property_name = land_name.strip()
    plot.landmark = landmark.strip() if landmark else None
    plot.plot_type = plot_type.strip() if plot_type else None
    plot.address = address.strip() if address else None
    plot.year_of_registration = year_of_registration.strip() if year_of_registration else None
    plot.owner_name = owner_name.strip() if owner_name else None
    if area_value is not None:
        plot.area_value = area_value
    if area_unit:
        plot.area_unit = area_unit
    if lat is not None and not (kml_file and kml_file.filename):
        plot.lat = lat
    if lon is not None and not (kml_file and kml_file.filename):
        plot.lon = lon

    # Upload any new documents attached
    upload_files_groups = [
        ("FMB", fmb_file, "application/pdf"),
        ("PATTA", patta_file, "application/pdf"),
        ("DEED", deed_file, "application/pdf"),
        ("PARENT_DOCUMENT", parent_document_file, "application/pdf"),
        ("EC_DETAILS", ec_details_file, "application/pdf"),
        ("BUILDING_PLAN", building_plan_file, "application/pdf"),
        ("PLAN_APPROVAL", plan_approval_letter_file, "application/pdf"),
        ("BUILDING_PERMIT", building_permit_letter_file, "application/pdf"),
        ("PROPERTY_TAX", property_tax_file, "application/pdf"),
        ("AERIAL_PHOTO", aerial_photo_file, "application/pdf"),
        ("DISPUTE_DETAILS", dispute_details_file, "application/pdf"),
        ("ADANGAL", adangal_file, "application/pdf"),
        ("A_REGISTER", a_register_file, "application/pdf"),
        ("APPROVED_PLAN", approved_plan_file, "application/pdf"),
        ("SOURCE_KML", source_kml_file, "application/vnd.google-earth.kml+xml"),
        ("SHAPEFILE", shapefile_file, "application/octet-stream"),
    ]
    for doc_type, upload_list, default_ct in upload_files_groups:
        for idx, upload in enumerate(upload_list):
            if upload and upload.filename:
                file_bytes = await upload.read()
                if file_bytes:
                    ct = get_content_type(upload.filename, fallback=upload.content_type or default_ct)
                    key = f"documents/{plot_id}/{doc_type}_{idx}_{upload.filename}"
                    upload_file(key, file_bytes, content_type=ct)
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


@router.get("/{plot_id}/kml-file")
def stream_plot_kml_file(plot_id: UUID, db: Session = Depends(get_db)):
    """Directly stream plot KML file bytes from storage. Works seamlessly in local offline mode."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")

    custom_kml = db.query(Document).filter(
        Document.plot_id == plot_id,
        Document.doc_type == "SOURCE_KML"
    ).order_by(Document.uploaded_at.desc()).first()

    if custom_kml:
        storage_key = custom_kml.storage_key
        raw_name = storage_key.split("/")[-1]
        clean_filename = re.sub(r"^[A-Za-z0-9_]+?_\d+_", "", raw_name)
    else:
        storage_key = plot.source_file_key or f"kml/{plot_id}.kml"
        clean_filename = f"{plot.plot_number or 'parcel'}_boundary.kml"

    try:
        data = download_file(storage_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read KML from storage: {e}")

    headers = {
        "Content-Disposition": f'attachment; filename="{clean_filename}"'
    }
    return Response(content=data, media_type="application/vnd.google-earth.kml+xml", headers=headers)


@router.get("/{plot_id}/kml-url")
def get_plot_kml_url(plot_id: UUID, db: Session = Depends(get_db)):
    """Get a download URL for the plot's KML file.
    In Cloud mode (Supabase): returns presigned URL.
    In Local mode (MinIO): returns relative streaming URL (/api/plots/{id}/kml-file)."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")

    # Check for custom SOURCE_KML document
    custom_kml = db.query(Document).filter(
        Document.plot_id == plot_id,
        Document.doc_type == "SOURCE_KML"
    ).order_by(Document.uploaded_at.desc()).first()

    if custom_kml:
        storage_key = custom_kml.storage_key
        raw_name = storage_key.split("/")[-1]
        clean_filename = re.sub(r"^[A-Za-z0-9_]+?_\d+_", "", raw_name)
    else:
        storage_key = plot.source_file_key or f"kml/{plot_id}.kml"
        clean_filename = f"{plot.plot_number or 'parcel'}_boundary.kml"

    if is_supabase_mode():
        url = get_presigned_url(storage_key, expires_seconds=3600, download_filename=clean_filename)
    else:
        url = f"/api/plots/{plot_id}/kml-file"

    return {"url": url, "storage_key": storage_key, "filename": clean_filename, "is_custom": custom_kml is not None}


@router.delete("/{plot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plot(
    plot_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Delete a plot and all associated documents, database records, and storage files. Admin only."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")

    # 1. Collect all storage keys without loading ORM Document instances into session identity map
    doc_records = db.query(Document.id, Document.storage_key).filter(Document.plot_id == plot_id).all()
    extra_keys = set(d[1] for d in doc_records if d[1])
    if plot.source_file_key:
        extra_keys.add(plot.source_file_key)

    # 2. Delete all files from storage (KML + documents folder)
    delete_plot_storage(str(plot_id), list(extra_keys))

    # 3. Clean up database relationships in correct FK order
    doc_ids = [d[0] for d in doc_records]
    if doc_ids:
        db.query(DocumentExtract).filter(DocumentExtract.document_id.in_(doc_ids)).delete(synchronize_session=False)

    db.query(Document).filter(Document.plot_id == plot_id).delete(synchronize_session=False)
    db.query(AISummary).filter(AISummary.plot_id == plot_id).delete(synchronize_session=False)
    db.query(Owner).filter(Owner.plot_id == plot_id).delete(synchronize_session=False)
    db.query(Transaction).filter(Transaction.plot_id == plot_id).delete(synchronize_session=False)
    db.query(TaxRecord).filter(TaxRecord.plot_id == plot_id).delete(synchronize_session=False)

    # 4. Delete plot itself directly via SQL query to avoid ORM StaleDataError
    db.query(Plot).filter(Plot.id == plot_id).delete(synchronize_session=False)
    db.commit()
