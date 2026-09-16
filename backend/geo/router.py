from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import GeoNode
from typing import List
from pydantic import BaseModel
from uuid import UUID


router = APIRouter(prefix="/geo", tags=["geo"])


class GeoNodeOut(BaseModel):
    id: UUID
    name: str
    level: str
    iso_code: str | None = None
    parent_id: UUID | None = None

    class Config:
        from_attributes = True


@router.get("/countries", response_model=List[GeoNodeOut])
def list_countries(db: Session = Depends(get_db)):
    """List all top-level country GeoNodes."""
    return db.query(GeoNode).filter(GeoNode.level == "COUNTRY").all()


@router.get("/{node_id}/children", response_model=List[GeoNodeOut])
def list_children(node_id: UUID, db: Session = Depends(get_db)):
    """List all children of a given GeoNode (e.g. states under a country)."""
    node = db.query(GeoNode).filter(GeoNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="GeoNode not found")
    return db.query(GeoNode).filter(GeoNode.parent_id == node_id).all()


@router.get("/by-name/{level}/{name}", response_model=GeoNodeOut)
def get_node_by_name(level: str, name: str, db: Session = Depends(get_db)):
    """Get a GeoNode by its level and name (e.g. DISTRICT/Coimbatore)."""
    node = db.query(GeoNode).filter(
        GeoNode.level == level.upper(),
        GeoNode.name == name
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"GeoNode {level}/{name} not found")
    return node
