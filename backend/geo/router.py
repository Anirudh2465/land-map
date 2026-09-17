from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import GeoNode, Plot
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
    plot_count: int = 0

    class Config:
        from_attributes = True


def get_plot_count(db: Session, node: GeoNode) -> int:
    if node.level == 'DISTRICT':
        return db.query(Plot).filter(Plot.geo_node_id == node.id).count()
    elif node.level == 'STATE':
        return db.query(Plot).join(GeoNode, Plot.geo_node_id == GeoNode.id).filter(GeoNode.parent_id == node.id).count()
    elif node.level == 'COUNTRY':
        return db.query(Plot).count()
    return 0


@router.get("/countries", response_model=List[GeoNodeOut])
def list_countries(db: Session = Depends(get_db)):
    """List all top-level country GeoNodes."""
    nodes = db.query(GeoNode).filter(GeoNode.level == "COUNTRY").all()
    for n in nodes:
        n.plot_count = get_plot_count(db, n)
    return nodes


@router.get("/{node_id}/children", response_model=List[GeoNodeOut])
def list_children(node_id: UUID, db: Session = Depends(get_db)):
    """List all children of a given GeoNode (e.g. states under a country)."""
    node = db.query(GeoNode).filter(GeoNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="GeoNode not found")
    children = db.query(GeoNode).filter(GeoNode.parent_id == node_id).all()
    for child in children:
        child.plot_count = get_plot_count(db, child)
    return children


@router.get("/by-name/{level}/{name}", response_model=GeoNodeOut)
def get_node_by_name(level: str, name: str, db: Session = Depends(get_db)):
    """Get a GeoNode by its level and name (e.g. DISTRICT/Coimbatore)."""
    node = db.query(GeoNode).filter(
        GeoNode.level == level.upper(),
        GeoNode.name == name
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"GeoNode {level}/{name} not found")
    node.plot_count = get_plot_count(db, node)
    return node
