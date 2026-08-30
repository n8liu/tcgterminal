"""Add raw_ebay_listings audit table."""

from alembic import op
import sqlalchemy as sa

revision = "0003_ebay_raw_listings"
down_revision = "0002_provider_pricing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "raw_ebay_listings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ebay_item_id", sa.String(64), nullable=False),
        sa.Column("card_id", sa.String(64), sa.ForeignKey("cards.id"), nullable=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("item_url", sa.String(1024), nullable=True),
        sa.Column("seller_feedback_score", sa.Integer(), nullable=True),
        sa.Column("listing_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("match_status", sa.String(24), nullable=False),
        sa.Column("rejection_reason", sa.String(128), nullable=True),
        sa.Column("grading_company", sa.String(32), nullable=True),
        sa.Column("grade", sa.Numeric(4, 1), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("ebay_item_id", name="uq_raw_ebay_listings_item_id"),
    )
    op.create_index("ix_raw_ebay_listings_card_id", "raw_ebay_listings", ["card_id"])
    op.create_index("ix_raw_ebay_listings_match_status", "raw_ebay_listings", ["match_status"])


def downgrade() -> None:
    op.drop_table("raw_ebay_listings")
