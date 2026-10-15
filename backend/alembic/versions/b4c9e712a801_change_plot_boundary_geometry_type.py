"""Change plot boundary geometry type to generic GEOMETRY

Revision ID: b4c9e712a801
Revises: f932859fdb0b
Create Date: 2026-10-15 12:12:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import geoalchemy2

# revision identifiers, used by Alembic.
revision: str = 'b4c9e712a801'
down_revision: Union[str, None] = 'f932859fdb0b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Alter boundary and boundary_simplified columns to GEOMETRY type so both Polygon and MultiPolygon are accepted
    op.execute(
        "ALTER TABLE plots ALTER COLUMN boundary TYPE geometry(GEOMETRY, 4326) USING ST_SetSRID(boundary, 4326);"
    )
    op.execute(
        "ALTER TABLE plots ALTER COLUMN boundary_simplified TYPE geometry(GEOMETRY, 4326) USING ST_SetSRID(boundary_simplified, 4326);"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE plots ALTER COLUMN boundary TYPE geometry(POLYGON, 4326) USING ST_GeometryN(boundary, 1);"
    )
    op.execute(
        "ALTER TABLE plots ALTER COLUMN boundary_simplified TYPE geometry(POLYGON, 4326) USING ST_GeometryN(boundary_simplified, 1);"
    )
