from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
import datetime


class DocumentOut(BaseModel):
    id: UUID
    doc_type: str  # FMB, PATTA, DEED
    storage_key: str

    class Config:
        from_attributes = True


class PlotListItem(BaseModel):
    id: UUID
    plot_number: Optional[str] = None   # LandID
    property_name: Optional[str] = None
    area_value: Optional[float] = None
    area_unit: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    location_name: Optional[str] = None
    landmark: Optional[str] = None
    plot_type: Optional[str] = None
    address: Optional[str] = None
    year_of_registration: Optional[str] = None
    owner_name: Optional[str] = None
    # GeoJSON geometry for map rendering
    boundary_geojson: Optional[dict] = None
    # Include docs for manage page count badge
    documents: List[DocumentOut] = []

    class Config:
        from_attributes = True


class PlotDetail(PlotListItem):
    survey_number: Optional[str] = None
    classification: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime.datetime] = None
    documents: List[DocumentOut] = []

    class Config:
        from_attributes = True
