"""add ai_texture_asset_id to wardrobe_items

Revision ID: b7f2a9c3a1d4
Revises: e0c8c2dfe8ca
Create Date: 2026-09-08 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7f2a9c3a1d4'
down_revision: Union[str, Sequence[str], None] = 'e0c8c2dfe8ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'wardrobe_items', sa.Column('ai_texture_asset_id', sa.Uuid(), nullable=True)
    )
    op.create_foreign_key(
        None, 'wardrobe_items', 'assets', ['ai_texture_asset_id'], ['id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(None, 'wardrobe_items', type_='foreignkey')
    op.drop_column('wardrobe_items', 'ai_texture_asset_id')