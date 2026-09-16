import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, Integer, Numeric, Date, text, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY, TIMESTAMP
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False) # 'ADMIN', 'EDITOR', 'VIEWER'
    preferred_language = Column(String, default="en")
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

class GeoNode(Base):
    __tablename__ = "geo_nodes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("geo_nodes.id"), index=True, nullable=True)
    level = Column(String, nullable=False) # 'COUNTRY', 'STATE', 'DISTRICT', 'PROVINCE', 'CUSTOM'
    name = Column(String, nullable=False)
    iso_code = Column(String, nullable=True)
    boundary = Column(Geometry('MULTIPOLYGON', srid=4326), nullable=True)
    boundary_lod1 = Column(Geometry('MULTIPOLYGON', srid=4326), nullable=True)
    boundary_lod2 = Column(Geometry('MULTIPOLYGON', srid=4326), nullable=True)
    has_free_source_data = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    parent = relationship("GeoNode", remote_side=[id], backref="children")
    plots = relationship("Plot", back_populates="geo_node")

class Plot(Base):
    __tablename__ = "plots"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    geo_node_id = Column(UUID(as_uuid=True), ForeignKey("geo_nodes.id"), nullable=False, index=True)
    property_name = Column(String, nullable=True)
    survey_number = Column(String, nullable=True)
    plot_number = Column(String, nullable=True)
    area_value = Column(Numeric(12, 2), nullable=True)
    area_unit = Column(String, default="sqm")
    classification = Column(String, nullable=True)
    boundary = Column(Geometry('POLYGON', srid=4326), nullable=False, index=True)
    boundary_simplified = Column(Geometry('POLYGON', srid=4326), nullable=True)
    centroid = Column(Geometry('POINT', srid=4326), server_default=text("ST_Centroid(boundary)"))
    tile_cell = Column(String, index=True, nullable=True)
    source_file_type = Column(String, default="KML")
    source_file_key = Column(String, nullable=True)
    status = Column(String, default="ACTIVE")
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    geo_node = relationship("GeoNode", back_populates="plots")
    owners = relationship("Owner", back_populates="plot")
    documents = relationship("Document", back_populates="plot")

class Owner(Base):
    __tablename__ = "owners"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plot_id = Column(UUID(as_uuid=True), ForeignKey("plots.id"), nullable=False)
    owner_name = Column(String, nullable=False, index=True)
    ownership_share = Column(Numeric(5, 2), default=100.00)
    is_current = Column(Boolean, default=True)
    valid_from = Column(Date, nullable=False)
    valid_to = Column(Date, nullable=True)

    plot = relationship("Plot", back_populates="owners")

class Document(Base):
    __tablename__ = "documents"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plot_id = Column(UUID(as_uuid=True), ForeignKey("plots.id"), nullable=False)
    doc_type = Column(String, nullable=False) # 'FMB', 'PATTA', 'DEED', 'OTHER'
    storage_key = Column(String, nullable=False)
    original_language = Column(String, nullable=True)
    uploaded_by = Column(UUID(as_uuid=True), nullable=True)
    uploaded_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    plot = relationship("Plot", back_populates="documents")
    extracts = relationship("DocumentExtract", back_populates="document")

class DocumentExtract(Base):
    __tablename__ = "document_extracts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    extracted_text = Column(String, nullable=True)
    detected_language = Column(String, nullable=True)
    translated_text = Column(String, nullable=True)
    translated_to = Column(String, nullable=True)
    ocr_confidence = Column(Numeric(5, 2), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    document = relationship("Document", back_populates="extracts")

class AISummary(Base):
    __tablename__ = "ai_summaries"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plot_id = Column(UUID(as_uuid=True), ForeignKey("plots.id"), unique=True, nullable=False)
    summary_text = Column(String, nullable=True)
    source_document_ids = Column(ARRAY(UUID(as_uuid=True)), nullable=True)
    generated_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plot_id = Column(UUID(as_uuid=True), ForeignKey("plots.id"), nullable=False)
    transaction_type = Column(String, nullable=False) # 'OWNERSHIP_TRANSFER', 'PLOT_ADDED', 'PLOT_UPDATED'
    from_owner_id = Column(UUID(as_uuid=True), ForeignKey("owners.id"), nullable=True)
    to_owner_id = Column(UUID(as_uuid=True), ForeignKey("owners.id"), nullable=True)
    performed_by = Column(UUID(as_uuid=True), nullable=True)
    performed_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    details = Column(JSONB, nullable=True)

class TaxRecord(Base):
    __tablename__ = "tax_records"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plot_id = Column(UUID(as_uuid=True), ForeignKey("plots.id"), nullable=False)
    tax_year = Column(Integer, nullable=False)
    amount_due = Column(Numeric(12, 2), nullable=False)
    amount_paid = Column(Numeric(12, 2), default=0)
    status = Column(String, default="UNPAID") # 'UNPAID', 'PARTIAL', 'PAID'

class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), nullable=True)
    action = Column(String, nullable=False)
    resource_type = Column(String, nullable=True)
    resource_id = Column(UUID(as_uuid=True), nullable=True)
    payload_delta = Column(JSONB, nullable=True)
    prev_hash = Column(String, nullable=True)
    row_hash = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
