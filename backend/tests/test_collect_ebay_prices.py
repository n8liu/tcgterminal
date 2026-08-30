from decimal import Decimal
from typing import Any
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.ebay import EbayClient
from app.models import Card, PriceObservation, ProviderCardState, RawEbayListing, Set
from jobs.collect_ebay_prices import run_ebay_price_collection


class MockEbayClient(EbayClient):
    def __init__(self, mock_items: list[dict[str, Any]]) -> None:
        super().__init__(
            client_id="mock_id",
            client_secret="mock_secret",
            acquire_request=lambda: None,
            sleep=lambda _: None,
        )
        self.mock_items = mock_items

    def search_item_summaries(
        self,
        query: str,
        limit: int = 50,
        category_ids: str | None = None,
        filter_exp: str | None = None,
    ) -> list[dict[str, Any]]:
        return self.mock_items


@pytest.fixture
def db_session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    with session_factory() as session:
        # Seed test set and card
        test_set = Set(id="base1", name="Base Set", series="Base", printed_total=102)
        test_card = Card(
            id="base1-4",
            name="Charizard",
            set_id="base1",
            number="4",
            printed_total=102,
            rarity="Rare Holo",
        )
        session.add_all([test_set, test_card])
        session.commit()
        yield session


def test_collect_ebay_prices_persists_raw_and_verified_observations(db_session: Session) -> None:
    mock_items = [
        {
            "itemId": "v1|1001|0",
            "title": "1999 Pokemon Base Set Charizard 4/102 Holo PSA 10 Gem Mint",
            "price": {"value": "3500.00", "currency": "USD"},
            "itemWebUrl": "https://www.ebay.com/itm/1001",
            "seller": {"feedbackScore": 1200},
            "itemCreationDate": "2026-08-20T12:00:00Z",
        },
        {
            "itemId": "v1|1002|0",
            "title": "Charizard Base Set 4/102 Holo PSA 10 Proxy Custom Card",
            "price": {"value": "15.00", "currency": "USD"},
            "itemWebUrl": "https://www.ebay.com/itm/1002",
            "seller": {"feedbackScore": 50},
            "itemCreationDate": "2026-08-20T13:00:00Z",
        },
    ]
    client = MockEbayClient(mock_items)

    result = run_ebay_price_collection(db_session, limit=5, ebay_client=client)

    assert result["cards"] == 1
    assert result["raw_listings"] == 2
    assert result["ebay_observations"] == 1
    assert result["provider_errors"] == 0

    # Verify Raw listings
    raw_listings = list(db_session.scalars(select(RawEbayListing).order_by(RawEbayListing.ebay_item_id)))
    assert len(raw_listings) == 2

    # Listing 1: PSA 10 matched
    assert raw_listings[0].ebay_item_id == "v1|1001|0"
    assert raw_listings[0].match_status == "matched"
    assert raw_listings[0].grading_company == "PSA"
    assert raw_listings[0].grade == Decimal("10.0")

    # Listing 2: Proxy rejected
    assert raw_listings[1].ebay_item_id == "v1|1002|0"
    assert raw_listings[1].match_status == "rejected"
    assert raw_listings[1].rejection_reason == "proxy_or_fake"

    # Verify PriceObservation (Only matched listing)
    observations = list(db_session.scalars(select(PriceObservation)))
    assert len(observations) == 1
    assert observations[0].provider == "ebay"
    assert observations[0].provider_card_id == "v1|1001|0"
    assert observations[0].grading_company == "PSA"
    assert observations[0].grade == Decimal("10.0")
    assert observations[0].price == Decimal("3500.00")

    # Verify ProviderCardState
    state = db_session.scalar(select(ProviderCardState).where(ProviderCardState.card_id == "base1-4"))
    assert state is not None
    assert state.provider == "ebay"
    assert state.match_status == "matched"


def test_collect_ebay_prices_dry_run_does_not_persist(db_session: Session) -> None:
    mock_items = [
        {
            "itemId": "v1|2001|0",
            "title": "1999 Pokemon Base Set Charizard 4/102 PSA 9 Mint",
            "price": {"value": "800.00", "currency": "USD"},
        }
    ]
    client = MockEbayClient(mock_items)

    result = run_ebay_price_collection(db_session, limit=5, ebay_client=client, dry_run=True)

    assert result["cards"] == 1
    assert result["raw_listings"] == 1
    assert result["ebay_observations"] == 1

    # Database should be empty
    assert len(list(db_session.scalars(select(RawEbayListing)))) == 0
    assert len(list(db_session.scalars(select(PriceObservation)))) == 0
