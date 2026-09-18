"""Add AI models

Revision ID: 2d123c762717
Revises: 0001
Create Date: 2026-09-17 05:43:32.595099

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2d123c762717'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tables 'ai_summaries' and 'document_extracts' are already created in 0001_initial_schema.
    pass


def downgrade() -> None:
    pass

