from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import GeoNode, Plot, Document, DocumentExtract, AISummary, Owner, Transaction, TaxRecord
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID
import uuid
import re
import urllib.parse
from auth.dependencies import require_admin
from minio_client import delete_plot_storage


router = APIRouter(prefix="/geo", tags=["geo"])


class GeoNodeOut(BaseModel):
    id: UUID
    name: str
    level: str
    iso_code: Optional[str] = None
    parent_id: Optional[UUID] = None
    plot_count: int = 0

    class Config:
        from_attributes = True


class VillageCreate(BaseModel):
    taluk_id: UUID
    name: str


class VillageRename(BaseModel):
    name: str


class ResolvePathResponse(BaseModel):
    chain: List[GeoNodeOut]
    current_node: Optional[GeoNodeOut] = None
    parcel_id: Optional[str] = None
    canonical_path: str


def get_plot_count(db: Session, node: GeoNode) -> int:
    """Recursively count ACTIVE plots under a geo node at any level."""
    if node.level == 'VILLAGE':
        # Plots attach directly to village nodes
        return db.query(Plot).filter(Plot.geo_node_id == node.id, Plot.status == "ACTIVE").count()

    elif node.level == 'TALUK':
        # Sum plots across all villages in this taluk
        village_ids = db.query(GeoNode.id).filter(GeoNode.parent_id == node.id)
        return db.query(Plot).filter(Plot.geo_node_id.in_(village_ids), Plot.status == "ACTIVE").count()

    elif node.level == 'DISTRICT':
        # Sum plots across all taluks → villages in this district
        taluk_ids = db.query(GeoNode.id).filter(GeoNode.parent_id == node.id)
        village_ids = db.query(GeoNode.id).filter(GeoNode.parent_id.in_(taluk_ids))
        # Also include legacy plots directly under district (backward compat)
        direct_count = db.query(Plot).filter(Plot.geo_node_id == node.id, Plot.status == "ACTIVE").count()
        village_count = db.query(Plot).filter(Plot.geo_node_id.in_(village_ids), Plot.status == "ACTIVE").count()
        return direct_count + village_count

    elif node.level == 'STATE':
        district_ids = db.query(GeoNode.id).filter(GeoNode.parent_id == node.id)
        taluk_ids = db.query(GeoNode.id).filter(GeoNode.parent_id.in_(district_ids))
        village_ids = db.query(GeoNode.id).filter(GeoNode.parent_id.in_(taluk_ids))
        return db.query(Plot).join(GeoNode, Plot.geo_node_id == GeoNode.id).filter(
            (GeoNode.parent_id.in_(district_ids)) | (Plot.geo_node_id.in_(village_ids)),
            Plot.status == "ACTIVE"
        ).count()

    elif node.level == 'COUNTRY':
        # Sum plots attached directly to the country (overseas) and all descendants
        direct_count = db.query(Plot).filter(Plot.geo_node_id == node.id, Plot.status == "ACTIVE").count()
        child_count = db.query(Plot).join(GeoNode, Plot.geo_node_id == GeoNode.id).filter(
            ((GeoNode.parent_id == node.id) |
            (GeoNode.parent_id.in_(db.query(GeoNode.id).filter(GeoNode.parent_id == node.id)))),
            Plot.status == "ACTIVE"
        ).count()
        return direct_count + child_count

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
    """List all children of a given GeoNode (e.g. states under a country, taluks under a district, villages under a taluk)."""
    node = db.query(GeoNode).filter(GeoNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="GeoNode not found")
    children = db.query(GeoNode).filter(GeoNode.parent_id == node_id).order_by(GeoNode.name).all()
    if node.level == 'COUNTRY' and node.name == 'India':
        children.sort(key=lambda c: (0 if c.name == 'Tamil Nadu' else 1, c.name))
    elif node.level == 'STATE' and node.name == 'Tamil Nadu':
        children.sort(key=lambda c: (0 if c.name == 'Coimbatore' else 1, c.name))
    for child in children:
        child.plot_count = get_plot_count(db, child)
    return children


# ── Village CRUD ───────────────────────────────────────────────────────────────

@router.post("/villages", response_model=GeoNodeOut, status_code=status.HTTP_201_CREATED)
def create_village(
    body: VillageCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Create a new village under a taluk. Admin only."""
    taluk = db.query(GeoNode).filter(GeoNode.id == body.taluk_id).first()
    if not taluk:
        raise HTTPException(status_code=404, detail="Taluk not found")
    if taluk.level != "TALUK":
        raise HTTPException(status_code=400, detail="Parent node must be a TALUK")

    # Check name uniqueness within the taluk
    existing = db.query(GeoNode).filter(
        GeoNode.parent_id == body.taluk_id,
        GeoNode.level == "VILLAGE",
        GeoNode.name == body.name.strip()
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Village '{body.name}' already exists in this taluk")

    village = GeoNode(
        id=uuid.uuid4(),
        parent_id=body.taluk_id,
        level="VILLAGE",
        name=body.name.strip(),
    )
    db.add(village)
    db.commit()
    db.refresh(village)
    village.plot_count = 0
    return village


@router.put("/villages/{village_id}", response_model=GeoNodeOut)
def rename_village(
    village_id: UUID,
    body: VillageRename,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Rename an existing village. Admin only."""
    village = db.query(GeoNode).filter(GeoNode.id == village_id, GeoNode.level == "VILLAGE").first()
    if not village:
        raise HTTPException(status_code=404, detail="Village not found")

    # Check name uniqueness within the taluk
    existing = db.query(GeoNode).filter(
        GeoNode.parent_id == village.parent_id,
        GeoNode.level == "VILLAGE",
        GeoNode.name == body.name.strip(),
        GeoNode.id != village_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Village '{body.name}' already exists in this taluk")

    village.name = body.name.strip()
    db.commit()
    db.refresh(village)
    village.plot_count = get_plot_count(db, village)
    return village


@router.delete("/villages/{village_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_village(
    village_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Delete a village and all its plots (with storage cleanup). Admin only."""
    village = db.query(GeoNode).filter(GeoNode.id == village_id, GeoNode.level == "VILLAGE").first()
    if not village:
        raise HTTPException(status_code=404, detail="Village not found")

    # Get all plots in this village
    village_plots = db.query(Plot).filter(Plot.geo_node_id == village_id).all()

    for plot in village_plots:
        plot_id = plot.id
        # Collect storage keys
        doc_records = db.query(Document.id, Document.storage_key).filter(Document.plot_id == plot_id).all()
        extra_keys = set(d[1] for d in doc_records if d[1])
        if plot.source_file_key:
            extra_keys.add(plot.source_file_key)

        # Delete storage files
        delete_plot_storage(str(plot_id), list(extra_keys))

        # Clean up DB relationships
        doc_ids = [d[0] for d in doc_records]
        if doc_ids:
            db.query(DocumentExtract).filter(DocumentExtract.document_id.in_(doc_ids)).delete(synchronize_session=False)
        db.query(Document).filter(Document.plot_id == plot_id).delete(synchronize_session=False)
        db.query(AISummary).filter(AISummary.plot_id == plot_id).delete(synchronize_session=False)
        db.query(Owner).filter(Owner.plot_id == plot_id).delete(synchronize_session=False)
        db.query(Transaction).filter(Transaction.plot_id == plot_id).delete(synchronize_session=False)
        db.query(TaxRecord).filter(TaxRecord.plot_id == plot_id).delete(synchronize_session=False)
        db.query(Plot).filter(Plot.id == plot_id).delete(synchronize_session=False)

    # Delete the village GeoNode itself
    db.query(GeoNode).filter(GeoNode.id == village_id).delete(synchronize_session=False)
    db.commit()


def normalize_name(s: str) -> str:
    s = urllib.parse.unquote(s)            # decode any %xx encoding
    s = s.strip().lower()
    s = s.replace("-", " ").replace("_", " ")
    s = re.sub(r"\s+", " ", s)           # collapse multiple whitespace
    return s


@router.get("/resolve-path", response_model=ResolvePathResponse)
def resolve_geo_path(path: str, db: Session = Depends(get_db)):
    """
    Resolve a URL path like 'India/Tamil-Nadu/Coimbatore/Coimbatore-South/Bogampatti'
    (and optional parcel UUID) into matched GeoNodes.
    """
    raw_segments = [s.strip() for s in path.strip("/").split("/") if s.strip()]
    if not raw_segments:
        return {"chain": [], "current_node": None, "parcel_id": None, "canonical_path": ""}

    parcel_id = None
    # Check if last segment is a 36-char UUID matching a Plot
    if len(raw_segments) > 0:
        try:
            val = uuid.UUID(raw_segments[-1])
            plot = db.query(Plot).filter(Plot.id == val).first()
            if plot:
                parcel_id = str(val)
                raw_segments.pop()
            elif len(raw_segments) == 1:
                # Legacy URL /manage/:uuid where :uuid is a GeoNode
                node = db.query(GeoNode).filter(GeoNode.id == val).first()
                if node:
                    chain = []
                    curr = node
                    while curr:
                        curr.plot_count = get_plot_count(db, curr)
                        chain.append(curr)
                        if not curr.parent_id:
                            break
                        curr = db.query(GeoNode).filter(GeoNode.id == curr.parent_id).first()
                    chain.reverse()
                    canonical_path = "/".join(c.name.replace(" ", "-") for c in chain)
                    return {
                        "chain": chain,
                        "current_node": node,
                        "parcel_id": None,
                        "canonical_path": canonical_path
                    }
        except ValueError:
            pass

    # Traverse step-by-step down the tree starting at COUNTRY
    chain = []
    parent_id = None

    for seg in raw_segments:
        norm = normalize_name(seg)
        # Skip literal "Overseas" segment if followed by an overseas country
        if norm == "overseas" and parent_id is None:
            continue

        query = db.query(GeoNode)
        if parent_id is None:
            query = query.filter(GeoNode.level == "COUNTRY")
        else:
            query = query.filter(GeoNode.parent_id == parent_id)

        # SQL-level normalized match: trim + lowercase + replace separators
        # This is more reliable than Python-level iteration (avoids encoding edge cases)
        matched = query.filter(
            func.lower(func.trim(
                func.replace(func.replace(GeoNode.name, '-', ' '), '_', ' ')
            )) == norm
        ).first()

        if matched:
            matched.plot_count = get_plot_count(db, matched)
            chain.append(matched)
            parent_id = matched.id
        else:
            # Check if this segment is a parcel UUID
            try:
                val = uuid.UUID(seg)
                plot = db.query(Plot).filter(Plot.id == val).first()
                if plot:
                    parcel_id = str(val)
                    break
            except ValueError:
                pass
            break

    current_node = chain[-1] if chain else None
    canonical_path = "/".join(c.name.replace(" ", "-") for c in chain)
    return {
        "chain": chain,
        "current_node": current_node,
        "parcel_id": parcel_id,
        "canonical_path": canonical_path
    }


@router.get("/by-name/{level}/{name}", response_model=GeoNodeOut)
def get_node_by_name(level: str, name: str, db: Session = Depends(get_db)):
    """Get a GeoNode by its level and name (e.g. DISTRICT/Coimbatore or DISTRICT/Coimbatore-South)."""
    clean_name = name.replace("-", " ")
    node = db.query(GeoNode).filter(
        GeoNode.level == level.upper(),
        (GeoNode.name.ilike(name)) | (GeoNode.name.ilike(clean_name))
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"GeoNode {level}/{name} not found")
    node.plot_count = get_plot_count(db, node)
    return node


@router.get("/{node_id}/hierarchy", response_model=List[GeoNodeOut])
def get_node_hierarchy(node_id: UUID, db: Session = Depends(get_db)):
    """Get the ancestor chain of a node from COUNTRY down to the node itself."""
    node = db.query(GeoNode).filter(GeoNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="GeoNode not found")
    chain = []
    curr = node
    while curr:
        curr.plot_count = get_plot_count(db, curr)
        chain.append(curr)
        if not curr.parent_id:
            break
        curr = db.query(GeoNode).filter(GeoNode.id == curr.parent_id).first()
    chain.reverse()
    return chain


@router.get("/{node_id}", response_model=GeoNodeOut)
def get_node(node_id: UUID, db: Session = Depends(get_db)):
    """Get a single GeoNode by its ID."""
    node = db.query(GeoNode).filter(GeoNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="GeoNode not found")
    node.plot_count = get_plot_count(db, node)
    return node

