"""concept_media retry_count (render-attempt cap)

Revision ID: b71f0c9d2a44
Revises: 94cc4063d201
Create Date: 2026-09-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'b71f0c9d2a44'
down_revision = '94cc4063d201'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('concept_media', sa.Column('retry_count', sa.SmallInteger(), server_default='0', nullable=False))


def downgrade() -> None:
    op.drop_column('concept_media', 'retry_count')
