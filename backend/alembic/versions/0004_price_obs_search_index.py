"""Add composite search lookup index on price_observations."""

from alembic import op
import sqlalchemy as sa

revision = "0004_price_obs_search_index"
down_revision = "0003_ebay_raw_listings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_price_observations_search_lookup",
        "price_observations",
        ["card_id", "provider", "grading_company", "provider_updated_at", "observed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_price_observations_search_lookup", table_name="price_observations")
