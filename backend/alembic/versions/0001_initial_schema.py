"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable PostGIS extension
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # users
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), unique=True, nullable=False, index=True),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('preferred_language', sa.String(), nullable=True, server_default='en'),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    # geo_nodes
    op.create_table(
        'geo_nodes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('geo_nodes.id'), nullable=True, index=True),
        sa.Column('level', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('iso_code', sa.String(), nullable=True),
        sa.Column('boundary', geoalchemy2.types.Geometry('MULTIPOLYGON', srid=4326), nullable=True),
        sa.Column('boundary_lod1', geoalchemy2.types.Geometry('MULTIPOLYGON', srid=4326), nullable=True),
        sa.Column('boundary_lod2', geoalchemy2.types.Geometry('MULTIPOLYGON', srid=4326), nullable=True),
        sa.Column('has_free_source_data', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    # plots
    op.create_table(
        'plots',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('geo_node_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('geo_nodes.id'), nullable=False, index=True),
        sa.Column('property_name', sa.String(), nullable=True),
        sa.Column('survey_number', sa.String(), nullable=True),
        sa.Column('plot_number', sa.String(), nullable=True, index=True),
        sa.Column('area_value', sa.Numeric(12, 2), nullable=True),
        sa.Column('area_unit', sa.String(), nullable=True, server_default='sqm'),
        sa.Column('classification', sa.String(), nullable=True),
        # MVP fields
        sa.Column('landmark', sa.String(), nullable=True),
        sa.Column('lat', sa.Float(), nullable=True),
        sa.Column('lon', sa.Float(), nullable=True),
        sa.Column('location_name', sa.String(), nullable=True),
        # Geometry
        sa.Column('boundary', geoalchemy2.types.Geometry('POLYGON', srid=4326), nullable=True, index=True),
        sa.Column('boundary_simplified', geoalchemy2.types.Geometry('POLYGON', srid=4326), nullable=True),
        sa.Column('centroid', geoalchemy2.types.Geometry('POINT', srid=4326), nullable=True),
        sa.Column('tile_cell', sa.String(), nullable=True, index=True),
        sa.Column('source_file_type', sa.String(), nullable=True, server_default='KML'),
        sa.Column('source_file_key', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True, server_default='ACTIVE'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    # owners
    op.create_table(
        'owners',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('plot_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('plots.id'), nullable=False),
        sa.Column('owner_name', sa.String(), nullable=False, index=True),
        sa.Column('ownership_share', sa.Numeric(5, 2), nullable=True, server_default='100.00'),
        sa.Column('is_current', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('valid_from', sa.Date(), nullable=False),
        sa.Column('valid_to', sa.Date(), nullable=True),
    )

    # documents
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('plot_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('plots.id'), nullable=False),
        sa.Column('doc_type', sa.String(), nullable=False),
        sa.Column('storage_key', sa.String(), nullable=False),
        sa.Column('original_language', sa.String(), nullable=True),
        sa.Column('uploaded_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('uploaded_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    # document_extracts
    op.create_table(
        'document_extracts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id'), nullable=False),
        sa.Column('extracted_text', sa.String(), nullable=True),
        sa.Column('detected_language', sa.String(), nullable=True),
        sa.Column('translated_text', sa.String(), nullable=True),
        sa.Column('translated_to', sa.String(), nullable=True),
        sa.Column('ocr_confidence', sa.Numeric(5, 2), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    # ai_summaries
    op.create_table(
        'ai_summaries',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('plot_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('plots.id'), unique=True, nullable=False),
        sa.Column('summary_text', sa.String(), nullable=True),
        sa.Column('source_document_ids', postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
        sa.Column('generated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    # transactions
    op.create_table(
        'transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('plot_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('plots.id'), nullable=False),
        sa.Column('transaction_type', sa.String(), nullable=False),
        sa.Column('from_owner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('owners.id'), nullable=True),
        sa.Column('to_owner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('owners.id'), nullable=True),
        sa.Column('performed_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('performed_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('details', postgresql.JSONB(), nullable=True),
    )

    # tax_records
    op.create_table(
        'tax_records',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('plot_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('plots.id'), nullable=False),
        sa.Column('tax_year', sa.Integer(), nullable=False),
        sa.Column('amount_due', sa.Numeric(12, 2), nullable=False),
        sa.Column('amount_paid', sa.Numeric(12, 2), nullable=True, server_default='0'),
        sa.Column('status', sa.String(), nullable=True, server_default='UNPAID'),
    )

    # audit_log
    op.create_table(
        'audit_log',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('resource_type', sa.String(), nullable=True),
        sa.Column('resource_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('payload_delta', postgresql.JSONB(), nullable=True),
        sa.Column('prev_hash', sa.String(), nullable=True),
        sa.Column('row_hash', sa.String(), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('audit_log')
    op.drop_table('tax_records')
    op.drop_table('transactions')
    op.drop_table('ai_summaries')
    op.drop_table('document_extracts')
    op.drop_table('documents')
    op.drop_table('owners')
    op.drop_table('plots')
    op.drop_table('geo_nodes')
    op.drop_table('users')
    op.execute("DROP EXTENSION IF EXISTS postgis")
