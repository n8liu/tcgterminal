"""Add provider match state and normalized price observations."""

from alembic import op
import sqlalchemy as sa

revision = "0002_provider_pricing"
down_revision = "0001_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "provider_card_states",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("card_id", sa.String(64), sa.ForeignKey("cards.id"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("provider_card_id", sa.String(128)),
        sa.Column("match_status", sa.String(24), nullable=False),
        sa.Column("match_method", sa.String(64)),
        sa.Column("payload", sa.JSON()),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("card_id", "provider", name="uq_provider_card_states_card_provider"),
    )
    op.create_index("ix_provider_card_states_card_id", "provider_card_states", ["card_id"])
    op.create_index("ix_provider_card_states_provider_status", "provider_card_states", ["provider", "match_status"])

    op.create_table(
        "price_observations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("card_id", sa.String(64), sa.ForeignKey("cards.id"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("provider_card_id", sa.String(128), nullable=False),
        sa.Column("variant_id", sa.String(255), nullable=False),
        sa.Column("condition", sa.String(64)),
        sa.Column("printing", sa.String(64)),
        sa.Column("grading_company", sa.String(32)),
        sa.Column("grade", sa.Numeric(4, 1)),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("provider_updated_at", sa.DateTime(timezone=True)),
        sa.Column("observed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("payload", sa.JSON()),
        sa.UniqueConstraint("fingerprint", name="uq_price_observations_fingerprint"),
    )
    op.create_index("ix_price_observations_card_id", "price_observations", ["card_id"])
    op.create_index("ix_price_observations_card_provider_time", "price_observations", ["card_id", "provider", "observed_at"])


def downgrade() -> None:
    op.drop_table("price_observations")
    op.drop_table("provider_card_states")
