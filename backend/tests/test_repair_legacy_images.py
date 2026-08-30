from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Card, Set
from jobs.repair_legacy_images import repair_legacy_images


class FakeClient:
    def __init__(self, cards):
        self.cards = cards

    def iter_sets(self):
        yield {"id": "remote-set", "name": "Test Set", "card_count": 100}

    def iter_cards(self, set_ids):
        assert set_ids == ["remote-set"]
        yield from self.cards


def _session() -> Session:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = Session(engine)
    session.add(Set(id="legacy-set", name="Test Set"))
    session.add(
        Card(
            id="legacy-card",
            name="Pikachu - 007/100",
            set_id="legacy-set",
            number="007",
            image_url="https://api.pokewallet.io/images/legacy-card",
        )
    )
    session.commit()
    return session


def test_repair_matches_name_suffix_and_numeric_card_number() -> None:
    session = _session()
    client = FakeClient(
        [{
            "id": "remote-card",
            "_set_id": "remote-set",
            "name": "Pikachu",
            "number": "7/100",
            "image_url": "https://images.test/pikachu.jpg",
        }]
    )

    result = repair_legacy_images(session, client, apply_changes=True)

    assert result.candidates == 1
    assert result.applied == 1
    assert session.get(Card, "legacy-card").image_url == "https://images.test/pikachu.jpg"
    session.close()


def test_repair_dry_run_does_not_change_image_url() -> None:
    session = _session()
    client = FakeClient(
        [{
            "id": "remote-card",
            "_set_id": "remote-set",
            "name": "Pikachu",
            "number": "007/100",
            "image_url": "https://images.test/pikachu.jpg",
        }]
    )

    result = repair_legacy_images(session, client)

    assert result.candidates == 1
    assert result.applied == 0
    assert session.get(Card, "legacy-card").image_url.startswith("https://api.pokewallet.io/")
    session.close()


def test_repair_skips_ambiguous_remote_matches() -> None:
    session = _session()
    client = FakeClient(
        [
            {
                "id": "remote-card-1",
                "_set_id": "remote-set",
                "name": "Pikachu",
                "number": "007/100",
                "image_url": "https://images.test/one.jpg",
            },
            {
                "id": "remote-card-2",
                "_set_id": "remote-set",
                "name": "Pikachu",
                "number": "007/100",
                "image_url": "https://images.test/two.jpg",
            },
        ]
    )

    result = repair_legacy_images(session, client, apply_changes=True)

    assert result.candidates == 0
    assert result.ambiguous == 1
    assert result.applied == 0
    session.close()


def test_repair_skips_unmatched_and_invalid_urls() -> None:
    session = _session()
    client = FakeClient(
        [{
            "id": "remote-card",
            "_set_id": "remote-set",
            "name": "Pikachu",
            "number": "007/100",
            "image_url": "http://images.test/pikachu.jpg",
        }]
    )

    result = repair_legacy_images(session, client, apply_changes=True)

    assert result.candidates == 0
    assert result.unmatched == 1
    assert result.applied == 0
    session.close()
