"""Create sacred sets and cards tables."""
from alembic import op
import sqlalchemy as sa

revision = "0001_catalog"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sets",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("series", sa.String(255)),
        sa.Column("printed_total", sa.Integer()),
        sa.Column("release_date", sa.Date()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sets_name", "sets", ["name"])
    op.create_table(
        "cards",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("set_id", sa.String(64), sa.ForeignKey("sets.id"), nullable=False),
        sa.Column("number", sa.String(32), nullable=False),
        sa.Column("printed_total", sa.Integer()),
        sa.Column("rarity", sa.String(128)),
        sa.Column("image_url", sa.String(1024)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_cards_name", "cards", ["name"])
    op.create_index("ix_cards_set_id", "cards", ["set_id"])


def downgrade() -> None:
    op.drop_table("cards")
    op.drop_table("sets")
