from sqlalchemy import create_engine, inspect

from app.database import Base
from app.models import Card, Set  # noqa: F401


def test_catalog_schema_contains_expected_sacred_columns() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)

    assert {column["name"] for column in inspector.get_columns("sets")} == {
        "id", "name", "series", "printed_total", "release_date", "updated_at"
    }
    assert {column["name"] for column in inspector.get_columns("cards")} == {
        "id", "name", "set_id", "number", "printed_total", "rarity", "image_url", "updated_at"
    }
