import logging
import re
from functools import lru_cache
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

import math
from app.config import get_settings
from app.database import get_db
from app.models import Card, PriceObservation, ProviderCardState, Set
from app.tcgapi import TCGAPIClient
from app.schemas.cards import (
    CardDetail,
    CardPricingResponse,
    CardSetOption,
    CardSummary,
    GradingProfitItem,
    GradingProfitResponse,
    MarketMoverItem,
    MarketMoversResponse,
    PriceObservationItem,
    ProviderPricingState,
    SealedSignalItem,
    SealedSignalsResponse,
    PokemonVolumeItem,
    PokemonVolumeResponse,
    LiveUpdateItem,
    LiveUpdatesResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cards", tags=["cards"])


@lru_cache
def get_tcgapi_client() -> TCGAPIClient:
    return TCGAPIClient()


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _summary(
    card: Card,
    card_set: Set,
    market_price: object | None = None,
    market_currency: str | None = None,
    last_updated_at: datetime | None = None,
) -> CardSummary:
    return CardSummary(
        id=card.id,
        name=card.name,
        set_id=card.set_id,
        set_name=card_set.name,
        number=card.number,
        printed_total=card.printed_total,
        rarity=card.rarity,
        image_url=f"/cards/{card.id}/image",
        market_price=float(market_price) if market_price is not None else None,
        market_currency=market_currency,
        last_updated_at=last_updated_at or card.updated_at,
    )


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _build_mover_item(
    raw: dict[str, Any],
    direction: str,
    period: str,
    card_map: dict[str, tuple[Card, Set]],
) -> MarketMoverItem | None:
    card_id = str(raw.get("card_id") or "")
    if not card_id:
        return None
    name = str(raw.get("name") or raw.get("card_name") or "")
    set_name = str(raw.get("set_name") or "")
    printing = raw.get("printing")
    price_val = raw.get("market_price")
    if price_val is None:
        return None
    try:
        market_price = float(price_val)
    except (ValueError, TypeError):
        return None
    pct_val = raw.get("price_change")
    try:
        pct = float(pct_val) if pct_val is not None else 0.0
    except (ValueError, TypeError):
        pct = 0.0

    # Calculate approximate dollar change from percentage change
    if pct != 0.0 and (1.0 + (pct / 100.0)) > 0:
        old_price = market_price / (1.0 + (pct / 100.0))
        price_change_amount = round(market_price - old_price, 2)
    else:
        price_change_amount = None

    last_updated_at = _parse_iso_datetime(raw.get("last_updated_at"))

    local_entry = card_map.get(card_id)
    if local_entry:
        card, card_set = local_entry
        return MarketMoverItem(
            card_id=card.id,
            name=card.name,
            set_id=card.set_id,
            set_name=card_set.name,
            number=card.number,
            rarity=card.rarity,
            image_url=f"/cards/{card.id}/image",
            printing=printing,
            market_price=market_price,
            price_change_percentage=round(pct, 2),
            price_change_amount=price_change_amount,
            period=period,
            direction=direction,
            last_updated_at=last_updated_at or card.updated_at,
        )
    else:
        return MarketMoverItem(
            card_id=card_id,
            name=name,
            set_id=None,
            set_name=set_name,
            number=None,
            rarity=None,
            image_url=f"/cards/{card_id}/image",
            printing=printing,
            market_price=market_price,
            price_change_percentage=round(pct, 2),
            price_change_amount=price_change_amount,
            period=period,
            direction=direction,
            last_updated_at=last_updated_at,
        )


_MOVERS_CACHE: dict[str, tuple[float, list[dict[str, Any]], list[dict[str, Any]]]] = {}
MOVERS_CACHE_TTL_SECONDS = 900.0  # 15 minutes TTL for optimal API quota preservation


@router.get("/market-movers", response_model=MarketMoversResponse)
def get_market_movers(
    direction: Literal["up", "down", "all"] = Query(default="all"),
    period: Literal["24h", "7d", "30d"] = Query(default="24h"),
    game: Literal["pokemon", "pokemon-japan"] = Query(default="pokemon"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=12, ge=1, le=50),
    db: Session = Depends(get_db),
    client: TCGAPIClient = Depends(get_tcgapi_client),
) -> MarketMoversResponse:
    import math
    import time

    now = time.time()
    cache_key = f"{game}:{period}"

    cached = _MOVERS_CACHE.get(cache_key)
    if cached and (now - cached[0]) < MOVERS_CACHE_TTL_SECONDS:
        _, gainers_raw, losers_raw = cached
    else:
        gainers_raw = []
        losers_raw = []
        try:
            up_payload = client.get_top_movers(game=game, direction="up", period=period, limit=50)
            gainers_raw = up_payload.get("data") or []
        except Exception as exc:
            logger.error(
                "Failed fetching top gainers game=%s period=%s error=%s: %s",
                game,
                period,
                type(exc).__name__,
                exc,
            )

        try:
            down_payload = client.get_top_movers(game=game, direction="down", period=period, limit=50)
            losers_raw = down_payload.get("data") or []
        except Exception as exc:
            logger.error(
                "Failed fetching top losers game=%s period=%s error=%s: %s",
                game,
                period,
                type(exc).__name__,
                exc,
            )

        if gainers_raw or losers_raw:
            _MOVERS_CACHE[cache_key] = (now, gainers_raw, losers_raw)
        elif cached:
            # Stale-while-revalidate fallback: serve previously cached data on API rate limit or transient error
            logger.warning(
                "Serving stale cached market movers due to provider rate limit/error cache_key=%s",
                cache_key,
            )
            _, gainers_raw, losers_raw = cached

    # Collect card IDs to fetch local metadata in one batch query
    all_card_ids = {str(item.get("card_id")) for item in (gainers_raw + losers_raw) if item.get("card_id")}
    card_map: dict[str, tuple[Card, Set]] = {}
    if all_card_ids:
        rows = db.execute(
            select(Card, Set).join(Set, Card.set_id == Set.id).where(Card.id.in_(all_card_ids))
        ).all()
        for card, card_set in rows:
            card_map[card.id] = (card, card_set)

    all_gainers = [
        item for item in (_build_mover_item(raw, "up", period, card_map) for raw in gainers_raw)
        if item is not None
    ]
    all_losers = [
        item for item in (_build_mover_item(raw, "down", period, card_map) for raw in losers_raw)
        if item is not None
    ]

    total_gainers = len(all_gainers)
    total_losers = len(all_losers)

    if direction == "up":
        total_items = total_gainers
    elif direction == "down":
        total_items = total_losers
    else:
        total_items = max(total_gainers, total_losers)

    total_pages = max(1, math.ceil(total_items / per_page))
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page

    paged_gainers = all_gainers[start_idx:end_idx] if direction in ("up", "all") else []
    paged_losers = all_losers[start_idx:end_idx] if direction in ("down", "all") else []

    return MarketMoversResponse(
        period=period,
        direction=direction,
        page=page,
        per_page=per_page,
        total_gainers=total_gainers,
        total_losers=total_losers,
        total_pages=total_pages,
        gainers=paged_gainers,
        losers=paged_losers,
        updated_at=datetime.now(UTC),
    )


@router.get("/search", response_model=list[CardSummary])
def search_cards(
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=24, ge=1, le=50),
    offset: int = Query(default=0, ge=0, le=100_000),
    set_id: str | None = Query(default=None, max_length=64),
    game: Literal["all", "pokemon", "pokemon-japan"] = Query(default="all"),
    sort_by: Literal["price_desc", "price_asc", "number_asc", "number_desc", "name", "set"] | None = Query(
        default="price_desc"
    ),
    hide_sealed: bool = Query(default=True),
    sealed_only: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[CardSummary]:
    latest_price = (
        select(PriceObservation.price)
        .where(
            PriceObservation.card_id == Card.id,
            PriceObservation.provider == "tcgapi",
            PriceObservation.grading_company.is_(None),
        )
        .order_by(
            PriceObservation.provider_updated_at.desc().nullslast(),
            PriceObservation.observed_at.desc(),
            PriceObservation.id.desc(),
        )
        .limit(1)
        .correlate(Card)
        .scalar_subquery()
    )
    latest_currency = (
        select(PriceObservation.currency)
        .where(
            PriceObservation.card_id == Card.id,
            PriceObservation.provider == "tcgapi",
            PriceObservation.grading_company.is_(None),
        )
        .order_by(
            PriceObservation.provider_updated_at.desc().nullslast(),
            PriceObservation.observed_at.desc(),
            PriceObservation.id.desc(),
        )
        .limit(1)
        .correlate(Card)
        .scalar_subquery()
    )
    latest_synced = (
        select(func.max(ProviderCardState.last_synced_at))
        .where(ProviderCardState.card_id == Card.id)
        .correlate(Card)
        .scalar_subquery()
    )
    statement = (
        select(Card, Set, latest_price, latest_currency, latest_synced)
        .join(Set, Card.set_id == Set.id)
        .where(
            Card.name.not_ilike("%code card%"),
            or_(Card.rarity.is_(None), Card.rarity.not_ilike("%code card%")),
        )
    )
    if game == "pokemon":
        statement = statement.where(or_(Set.series.is_(None), Set.series != "Pokemon Japan"))
    elif game == "pokemon-japan":
        statement = statement.where(Set.series == "Pokemon Japan")

    query = q.strip()
    if query:
        pattern = f"%{_escape_like(query)}%"
        statement = statement.where(
            or_(Card.name.ilike(pattern, escape="\\"), Set.name.ilike(pattern, escape="\\"))
        )
    if set_id:
        statement = statement.where(Card.set_id == set_id)
    if sealed_only:
        statement = statement.where(or_(Card.rarity.is_(None), Card.rarity == ""))
    elif hide_sealed:
        statement = statement.where(Card.rarity.is_not(None), Card.rarity != "")
    is_sealed = case((or_(Card.rarity.is_(None), Card.rarity == ""), 0), else_=1)

    if sort_by == "price_asc":
        order = (
            latest_price.asc().nullslast(),
            Card.name.asc(),
            Card.id.asc(),
        )
    elif sort_by == "number_asc":
        order = (
            Set.name.asc(),
            is_sealed.asc(),
            func.length(Card.number).asc(),
            Card.number.asc(),
            Card.name.asc(),
            Card.id.asc(),
        )
    elif sort_by == "number_desc":
        order = (
            Set.name.asc(),
            is_sealed.asc(),
            func.length(Card.number).desc(),
            Card.number.desc(),
            Card.name.asc(),
            Card.id.asc(),
        )
    elif sort_by == "name":
        order = (
            Card.name.asc(),
            Set.name.asc(),
            Card.number.asc(),
            Card.id.asc(),
        )
    elif sort_by == "set":
        order = (
            Set.release_date.desc().nullslast(),
            Set.name.asc(),
            is_sealed.asc(),
            func.length(Card.number).asc(),
            Card.number.asc(),
            Card.name.asc(),
            Card.id.asc(),
        )
    else:  # default "price_desc"
        order = (
            latest_price.desc().nullslast(),
            Card.name.asc(),
            Card.id.asc(),
        )

    rows = db.execute(statement.order_by(*order).offset(offset).limit(limit)).all()
    return [
        _summary(card, card_set, market_price, market_currency, latest_synced)
        for card, card_set, market_price, market_currency, latest_synced in rows
    ]


@router.get("/sets", response_model=list[CardSetOption])
def list_card_sets(
    game: Literal["all", "pokemon", "pokemon-japan"] = Query(default="all"),
    db: Session = Depends(get_db),
) -> list[CardSetOption]:
    stmt = select(Set).where(Set.id.in_(select(Card.set_id).distinct()))
    if game == "pokemon":
        stmt = stmt.where(or_(Set.series.is_(None), Set.series != "Pokemon Japan"))
    elif game == "pokemon-japan":
        stmt = stmt.where(Set.series == "Pokemon Japan")

    card_sets = list(
        db.scalars(
            stmt.order_by(Set.release_date.desc().nullslast(), Set.name.asc(), Set.id.asc())
        )
    )
    return [
        CardSetOption(
            id=card_set.id,
            name=card_set.name,
            series=card_set.series,
            release_date=card_set.release_date,
        )
        for card_set in card_sets
    ]


def _classify_sealed_product(name: str) -> tuple[str, str]:
    """
    Classify sealed products by name pattern.
    Returns (display_type, category_slug)
    """
    lower = name.lower()
    if "case" in lower:
        return "Case", "case"
    if "booster box" in lower:
        return "Booster Box", "booster_box"
    if "elite trainer box" in lower or "etb" in lower or "pokemon center elite" in lower:
        return "Elite Trainer Box", "etb"
    if "booster bundle" in lower:
        return "Booster Bundle", "bundle"
    if "blister" in lower:
        return "Blister Pack", "blister"
    if "sleeved booster" in lower or "booster pack" in lower or "art bundle" in lower:
        return "Booster Pack", "pack"
    if "tin" in lower or "collection" in lower or "box" in lower or "stadium" in lower or "chest" in lower:
        return "Collection Box", "collection"
    return "Sealed Product", "all"


@router.get("/grading-profit", response_model=GradingProfitResponse)
def get_grading_profit(
    grading_fee: float | None = Query(default=None, ge=0.0, le=1000.0),
    sort_by: Literal[
        "psa10_profit_desc",
        "psa10_roi_desc",
        "psa9_profit_desc",
        "psa9_roi_desc",
        "ev_desc",
        "spread_desc",
        "raw_price_asc",
        "raw_price_desc",
    ] = Query(default="psa10_profit_desc"),
    target_grade: Literal["all", "psa10", "psa9"] = Query(default="all"),
    min_profit: float | None = Query(default=None),
    max_raw_price: float | None = Query(default=None, ge=0.0, description="Only include cards with raw price ≤ this value"),
    min_spread: float | None = Query(default=None, ge=0.0, description="Only include cards whose PSA10/raw multiplier ≥ this value"),
    psa9_safe_only: bool = Query(default=False),
    set_id: str | None = Query(default=None, max_length=64),
    q: str = Query(default="", max_length=120),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=12, ge=1, le=50),
    db: Session = Depends(get_db),
) -> GradingProfitResponse:
    settings = get_settings()
    active_fee = grading_fee if grading_fee is not None else settings.psa_value_fee

    # Query all card IDs with at least one graded comp
    graded_card_ids_stmt = select(PriceObservation.card_id).where(
        PriceObservation.grading_company.is_not(None)
    ).distinct()
    graded_card_ids = list(db.scalars(graded_card_ids_stmt))

    if not graded_card_ids:
        return GradingProfitResponse(
            page=page,
            per_page=per_page,
            total_cards=0,
            total_pages=1,
            grading_fee=active_fee,
            sort_by=sort_by,
            items=[],
            updated_at=datetime.now(UTC),
        )

    # Fetch Card & Set for all matching cards
    card_query = (
        select(Card, Set)
        .join(Set, Card.set_id == Set.id)
        .where(Card.id.in_(graded_card_ids))
    )
    if set_id:
        card_query = card_query.where(Card.set_id == set_id)
    query_str = q.strip().lower()
    if query_str:
        pattern = f"%{_escape_like(query_str)}%"
        card_query = card_query.where(
            or_(Card.name.ilike(pattern, escape="\\"), Set.name.ilike(pattern, escape="\\"))
        )

    cards_and_sets = db.execute(card_query).all()
    filtered_card_ids = [card.id for card, _ in cards_and_sets]
    if not filtered_card_ids:
        return GradingProfitResponse(
            page=page,
            per_page=per_page,
            total_cards=0,
            total_pages=1,
            grading_fee=active_fee,
            sort_by=sort_by,
            items=[],
            updated_at=datetime.now(UTC),
        )

    # Fetch all price observations for these cards
    all_obs = db.scalars(
        select(PriceObservation)
        .where(PriceObservation.card_id.in_(filtered_card_ids))
        .order_by(PriceObservation.observed_at.desc(), PriceObservation.id.desc())
    ).all()

    obs_by_card: dict[str, list[PriceObservation]] = {}
    for o in all_obs:
        obs_by_card.setdefault(o.card_id, []).append(o)

    items: list[GradingProfitItem] = []
    for card, cset in cards_and_sets:
        c_obs = obs_by_card.get(card.id, [])
        if not c_obs:
            continue

        raw_price: float | None = None
        psa10_price: float | None = None
        psa9_price: float | None = None
        latest_obs_time: datetime | None = None

        for o in c_obs:
            if latest_obs_time is None:
                latest_obs_time = o.observed_at

            # Raw check
            if o.grading_company is None and raw_price is None:
                try:
                    raw_price = float(o.price)
                except (ValueError, TypeError):
                    pass

            # PSA 10 check
            if (
                o.grading_company
                and o.grading_company.upper() == "PSA"
                and o.grade is not None
                and float(o.grade) == 10.0
                and psa10_price is None
            ):
                try:
                    psa10_price = float(o.price)
                except (ValueError, TypeError):
                    pass

            # PSA 9 check
            if (
                o.grading_company
                and o.grading_company.upper() == "PSA"
                and o.grade is not None
                and float(o.grade) == 9.0
                and psa9_price is None
            ):
                try:
                    psa9_price = float(o.price)
                except (ValueError, TypeError):
                    pass

        if raw_price is None or raw_price <= 0:
            continue
        if psa10_price is None and psa9_price is None:
            continue

        fee = float(active_fee)
        total_cost = raw_price + fee

        # Calculate PSA 10 metrics
        psa10_profit = round(psa10_price - total_cost, 2) if psa10_price is not None else None
        psa10_roi = (
            round((psa10_profit / total_cost) * 100, 1)
            if psa10_profit is not None and total_cost > 0
            else None
        )

        # Calculate PSA 9 metrics
        psa9_profit = round(psa9_price - total_cost, 2) if psa9_price is not None else None
        psa9_roi = (
            round((psa9_profit / total_cost) * 100, 1)
            if psa9_profit is not None and total_cost > 0
            else None
        )

        spread_multiplier = (
            round(psa10_price / raw_price, 2)
            if psa10_price is not None and raw_price > 0
            else None
        )

        # Weighted Expected Value: 60% PSA 10 + 35% PSA 9 + 5% Raw floor break-even
        ev_p10 = psa10_profit if psa10_profit is not None else 0.0
        ev_p9 = psa9_profit if psa9_profit is not None else 0.0
        expected_value = round((0.60 * ev_p10) + (0.35 * ev_p9), 2)

        # PSA 9 Safe: Does PSA 9 yield positive or break-even profit?
        psa9_safe = psa9_profit is not None and psa9_profit >= 0.0

        # Filter criteria
        if target_grade == "psa10" and psa10_price is None:
            continue
        if target_grade == "psa9" and psa9_price is None:
            continue
        if max_raw_price is not None and raw_price > max_raw_price:
            continue
        if min_spread is not None and (spread_multiplier is None or spread_multiplier < min_spread):
            continue
        if psa9_safe_only and not psa9_safe:
            continue
        if min_profit is not None:
            has_min_p10 = psa10_profit is not None and psa10_profit >= min_profit
            has_min_p9 = psa9_profit is not None and psa9_profit >= min_profit
            if not (has_min_p10 or has_min_p9):
                continue

        items.append(
            GradingProfitItem(
                card_id=card.id,
                name=card.name,
                set_id=card.set_id,
                set_name=cset.name,
                number=card.number,
                rarity=card.rarity,
                image_url=f"/cards/{card.id}/image",
                raw_price=round(raw_price, 2),
                psa10_price=round(psa10_price, 2) if psa10_price is not None else None,
                psa10_profit=psa10_profit,
                psa10_roi=psa10_roi,
                psa9_price=round(psa9_price, 2) if psa9_price is not None else None,
                psa9_profit=psa9_profit,
                psa9_roi=psa9_roi,
                spread_multiplier=spread_multiplier,
                expected_value=expected_value,
                psa9_safe=psa9_safe,
                grading_fee=round(fee, 2),
                last_updated_at=latest_obs_time or card.updated_at,
            )
        )

    # Sorting
    if sort_by == "psa10_roi_desc":
        items.sort(key=lambda x: (x.psa10_roi is not None, x.psa10_roi or -999999.0), reverse=True)
    elif sort_by == "psa9_profit_desc":
        items.sort(key=lambda x: (x.psa9_profit is not None, x.psa9_profit or -999999.0), reverse=True)
    elif sort_by == "psa9_roi_desc":
        items.sort(key=lambda x: (x.psa9_roi is not None, x.psa9_roi or -999999.0), reverse=True)
    elif sort_by == "ev_desc":
        items.sort(key=lambda x: (x.expected_value is not None, x.expected_value or -999999.0), reverse=True)
    elif sort_by == "spread_desc":
        items.sort(key=lambda x: (x.spread_multiplier is not None, x.spread_multiplier or -999999.0), reverse=True)
    elif sort_by == "raw_price_asc":
        items.sort(key=lambda x: x.raw_price)
    elif sort_by == "raw_price_desc":
        items.sort(key=lambda x: x.raw_price, reverse=True)
    else:  # default "psa10_profit_desc"
        items.sort(key=lambda x: (x.psa10_profit is not None, x.psa10_profit or -999999.0), reverse=True)

    total_cards = len(items)
    total_pages = max(1, math.ceil(total_cards / per_page))
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paged_items = items[start_idx:end_idx]

    return GradingProfitResponse(
        page=page,
        per_page=per_page,
        total_cards=total_cards,
        total_pages=total_pages,
        grading_fee=round(float(active_fee), 2),
        sort_by=sort_by,
        items=paged_items,
        updated_at=datetime.now(UTC),
    )


@router.get("/sealed-signals", response_model=SealedSignalsResponse)
def get_sealed_signals(
    signal: Literal["all", "strong_buy", "buy", "hold", "underperform"] = Query(default="all"),
    product_type: Literal[
        "all",
        "booster_box",
        "etb",
        "bundle",
        "case",
        "pack",
        "blister",
        "collection",
    ] = Query(default="all"),
    sort_by: Literal[
        "score_desc",
        "supply_asc",
        "momentum_desc",
        "price_desc",
        "price_asc",
        "age_desc",
    ] = Query(default="score_desc"),
    set_id: str | None = Query(default=None, max_length=64),
    q: str = Query(default="", max_length=120),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=12, ge=1, le=50),
    db: Session = Depends(get_db),
) -> SealedSignalsResponse:
    # 1. Query all sealed merchandise rows (rarity is null or empty)
    query = (
        select(Card, Set)
        .join(Set, Card.set_id == Set.id)
        .where(
            or_(Card.rarity.is_(None), Card.rarity == ""),
            Card.name.not_ilike("%code card%"),
        )
    )
    if set_id:
        query = query.where(Card.set_id == set_id)
    query_str = q.strip().lower()
    if query_str:
        pattern = f"%{_escape_like(query_str)}%"
        query = query.where(
            or_(Card.name.ilike(pattern, escape="\\"), Set.name.ilike(pattern, escape="\\"))
        )

    sealed_rows = db.execute(query).all()
    if not sealed_rows:
        return SealedSignalsResponse(
            page=page,
            per_page=per_page,
            total_items=0,
            total_pages=1,
            signal_filter=signal,
            product_type_filter=product_type,
            sort_by=sort_by,
            strong_buy_count=0,
            buy_count=0,
            hold_count=0,
            underperform_count=0,
            items=[],
            updated_at=datetime.now(UTC),
        )

    card_ids = [c.id for c, _ in sealed_rows]
    # Fetch TCG API observations for these sealed products
    obs_list = db.scalars(
        select(PriceObservation)
        .where(
            PriceObservation.card_id.in_(card_ids),
            PriceObservation.provider == "tcgapi",
        )
    ).all()
    obs_map: dict[str, PriceObservation] = {o.card_id: o for o in obs_list}

    today = datetime.now(UTC).date()
    all_scored_items: list[tuple[SealedSignalItem, str]] = []
    strong_buy_count = 0
    buy_count = 0
    hold_count = 0
    underperform_count = 0

    for card, cset in sealed_rows:
        obs = obs_map.get(card.id)
        p = obs.payload if obs and isinstance(obs.payload, dict) else {}
        market_price = _extract_float(p, "market_price")
        if market_price is None and obs:
            try:
                market_price = float(obs.price)
            except (ValueError, TypeError):
                market_price = None

        if market_price is None or market_price <= 0:
            continue

        clean_name = str(p.get("clean_name") or card.name.lower())
        disp_type, cat_slug = _classify_sealed_product(card.name)

        total_listings = int(p.get("total_listings") or 0)
        low_price = _extract_float(p, "low_price")
        median_price = _extract_float(p, "median_price")
        lowest_with_shipping = _extract_float(p, "lowest_with_shipping")
        buylist_price = _extract_float(p, "buylist_price")

        # 1. Supply Scarcity Score (0-30 pts)
        if total_listings > 0:
            if total_listings < 15:
                supply_score = 30
                supply_rating = "Ultra Scarce"
            elif total_listings < 40:
                supply_score = 22
                supply_rating = "Low Float"
            elif total_listings < 80:
                supply_score = 14
                supply_rating = "Moderate"
            elif total_listings < 150:
                supply_score = 8
                supply_rating = "Moderate"
            else:
                supply_score = 4
                supply_rating = "High Supply"
        else:
            supply_score = 15
            supply_rating = "Moderate"

        # 2. Set Vintage & Out-of-Print Age (0-20 pts)
        set_age_months = 0
        if cset.release_date:
            delta_days = (today - cset.release_date).days
            set_age_months = max(0, delta_days // 30)
            if set_age_months >= 36:
                vintage_score = 20
            elif set_age_months >= 24:
                vintage_score = 16
            elif set_age_months >= 12:
                vintage_score = 12
            elif set_age_months >= 6:
                vintage_score = 8
            else:
                vintage_score = 4
        else:
            vintage_score = 10

        # 3. Demand & Liquidity (0-25 pts)
        if buylist_price and market_price > 0:
            b_ratio = buylist_price / market_price
            if b_ratio >= 0.80:
                demand_score = 25
            elif b_ratio >= 0.65:
                demand_score = 18
            elif b_ratio >= 0.50:
                demand_score = 12
            else:
                demand_score = 6
        else:
            spread = (
                ((median_price - low_price) / median_price)
                if (median_price and low_price and median_price > 0)
                else 0.20
            )
            if spread < 0.10:
                demand_score = 18
            elif spread < 0.25:
                demand_score = 12
            else:
                demand_score = 8

        # 4. Price Momentum (0-25 pts)
        p30 = _extract_float(p, "price_change_30d") or 0.0
        p7 = _extract_float(p, "price_change_7d") or 0.0
        p24 = _extract_float(p, "price_change_24h") or 0.0

        momentum_pct = p30 if p30 != 0 else (p7 * 4.0 if p7 != 0 else p24 * 30.0)
        if momentum_pct >= 15.0:
            momentum_score = 25
        elif momentum_pct >= 5.0:
            momentum_score = 18
        elif momentum_pct >= 0.0:
            momentum_score = 14
        elif momentum_pct >= -10.0:
            momentum_score = 8
        else:
            momentum_score = 4

        total_score = min(100, supply_score + vintage_score + demand_score + momentum_score)
        if total_score >= 75:
            signal_label = "STRONG BUY"
            strong_buy_count += 1
        elif total_score >= 60:
            signal_label = "BUY"
            buy_count += 1
        elif total_score >= 45:
            signal_label = "HOLD"
            hold_count += 1
        else:
            signal_label = "UNDERPERFORM"
            underperform_count += 1

        item = SealedSignalItem(
            card_id=card.id,
            name=card.name,
            clean_name=clean_name,
            set_id=card.set_id,
            set_name=cset.name,
            series=cset.series,
            release_date=cset.release_date,
            image_url=f"/cards/{card.id}/image",
            product_type=disp_type,
            market_price=round(market_price, 2),
            low_price=round(low_price, 2) if low_price is not None else None,
            median_price=round(median_price, 2) if median_price is not None else None,
            lowest_with_shipping=round(lowest_with_shipping, 2) if lowest_with_shipping is not None else None,
            buylist_price=round(buylist_price, 2) if buylist_price is not None else None,
            total_listings=total_listings,
            supply_rating=supply_rating,
            set_age_months=set_age_months,
            price_change_24h=p24 if p24 != 0 else None,
            price_change_7d=p7 if p7 != 0 else None,
            price_change_30d=p30 if p30 != 0 else None,
            supply_score=supply_score,
            demand_score=demand_score,
            momentum_score=momentum_score,
            vintage_score=vintage_score,
            signal_score=total_score,
            signal_label=signal_label,
            last_updated_at=obs.observed_at if obs else card.updated_at,
        )
        all_scored_items.append((item, cat_slug))

    # Filter items
    filtered_items: list[SealedSignalItem] = []
    for item, cat_slug in all_scored_items:
        # Signal filter
        if signal == "strong_buy" and item.signal_label != "STRONG BUY":
            continue
        if signal == "buy" and item.signal_label != "BUY":
            continue
        if signal == "hold" and item.signal_label != "HOLD":
            continue
        if signal == "underperform" and item.signal_label != "UNDERPERFORM":
            continue

        # Product type filter
        if product_type != "all" and cat_slug != product_type:
            continue

        filtered_items.append(item)

    # Sorting
    if sort_by == "supply_asc":
        # Order by total_listings ascending (nonzero listings first)
        filtered_items.sort(key=lambda x: (x.total_listings == 0, x.total_listings, -x.signal_score))
    elif sort_by == "momentum_desc":
        filtered_items.sort(key=lambda x: (x.price_change_30d or x.price_change_7d or 0.0), reverse=True)
    elif sort_by == "price_desc":
        filtered_items.sort(key=lambda x: x.market_price, reverse=True)
    elif sort_by == "price_asc":
        filtered_items.sort(key=lambda x: x.market_price)
    elif sort_by == "age_desc":
        filtered_items.sort(key=lambda x: x.set_age_months, reverse=True)
    else:  # default "score_desc"
        filtered_items.sort(key=lambda x: (x.signal_score, -x.total_listings), reverse=True)

    total_items = len(filtered_items)
    total_pages = max(1, math.ceil(total_items / per_page))
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paged_items = filtered_items[start_idx:end_idx]

    return SealedSignalsResponse(
        page=page,
        per_page=per_page,
        total_items=total_items,
        total_pages=total_pages,
        signal_filter=signal,
        product_type_filter=product_type,
        sort_by=sort_by,
        strong_buy_count=strong_buy_count,
        buy_count=buy_count,
        hold_count=hold_count,
        underperform_count=underperform_count,
        items=paged_items,
        updated_at=datetime.now(UTC),
    )


# ---------------------------------------------------------------------------
# Top 50 Pokémon Sales by Volume Dataset
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Top 50 Pokémon — fixed roster, all metrics computed live from the database
# ---------------------------------------------------------------------------

# The 50 established Pokémon market leaders tracked for volume analytics.
# Character names are fixed; all volume/YoY values are computed from
# real PriceObservation aggregates — no hardcoded numbers.
POKEMON_TOP_50_NAMES: list[str] = [
    "Charizard", "Pikachu", "Gengar", "Mew", "Umbreon",
    "Mewtwo", "Rayquaza", "Dragonite", "Lugia", "Blastoise",
    "Eevee", "Gyarados", "Venusaur", "Magikarp", "Snorlax",
    "Latias", "Psyduck", "Espeon", "Greninja", "Charmander",
    "Latios", "Mimikyu", "Zapdos", "Giratina", "Moltres",
    "Squirtle", "Sylveon", "Reshiram", "Tyranitar", "Alakazam",
    "Deoxys", "Raichu", "Gardevoir", "Articuno", "Bulbasaur",
    "Lucario", "Darkrai", "Flareon", "Vaporeon", "Jolteon",
    "Celebi", "Jirachi", "Kyogre", "Groudon", "Suicune",
    "Entei", "Raikou", "Dialga", "Palkia", "Arceus",
]

POKEMON_DEX_NUMBERS: dict[str, int] = {
    "Charizard": 6,   "Pikachu": 25,  "Gengar": 94,   "Mew": 151,    "Umbreon": 197,
    "Mewtwo": 150,    "Rayquaza": 384, "Dragonite": 149, "Lugia": 249,  "Blastoise": 9,
    "Eevee": 133,     "Gyarados": 130, "Venusaur": 3,   "Magikarp": 129, "Snorlax": 143,
    "Latias": 380,    "Psyduck": 54,  "Espeon": 196,   "Greninja": 658, "Charmander": 4,
    "Latios": 381,    "Mimikyu": 778, "Zapdos": 145,   "Giratina": 487, "Moltres": 146,
    "Squirtle": 7,    "Sylveon": 700, "Reshiram": 643, "Tyranitar": 248, "Alakazam": 65,
    "Deoxys": 386,    "Raichu": 26,   "Gardevoir": 282, "Articuno": 144, "Bulbasaur": 1,
    "Lucario": 448,   "Darkrai": 491, "Flareon": 136,  "Vaporeon": 134, "Jolteon": 135,
    "Celebi": 251,    "Jirachi": 385, "Kyogre": 382,   "Groudon": 383, "Suicune": 245,
    "Entei": 244,     "Raikou": 243,  "Dialga": 483,   "Palkia": 484,  "Arceus": 493,
}

# Precompile word-boundary patterns — prevents "Mew" from matching "Mewtwo", etc.
_POKEMON_PATTERNS: dict[str, re.Pattern[str]] = {
    name: re.compile(rf"\b{re.escape(name)}\b", re.IGNORECASE)
    for name in POKEMON_TOP_50_NAMES
}

_pokemon_volume_cache: dict[str, tuple[datetime, PokemonVolumeResponse]] = {}
POKEMON_VOLUME_CACHE_TTL = 300  # 5 minutes


def _match_to_pokemon(card_name: str) -> str | None:
    """Attribute a card name to one of the 50 tracked Pokémon via word-boundary regex.

    Uses pre-compiled patterns so e.g. 'Mew' never matches 'Mewtwo'.
    Returns the first matching Pokémon name, or None if no match.
    """
    for poke_name, pattern in _POKEMON_PATTERNS.items():
        if pattern.search(card_name):
            return poke_name
    return None


def _bulk_pokemon_volume(
    db: Session,
    cutoff: datetime | None,
) -> dict[str, float]:
    """Return sum(price_observations.price) per tracked Pokémon, filtered by time cutoff.

    Uses a single SQL query over all 50 name patterns and groups in Python.
    """
    name_filter = or_(*[Card.name.ilike(f"%{n}%") for n in POKEMON_TOP_50_NAMES])
    stmt = (
        select(Card.name, func.sum(PriceObservation.price).label("vol"))
        .join(PriceObservation, PriceObservation.card_id == Card.id)
        .where(name_filter, Card.name.not_ilike("%code card%"))
        .group_by(Card.name)
    )
    if cutoff is not None:
        stmt = stmt.where(PriceObservation.observed_at >= cutoff)
    rows = db.execute(stmt).all()
    vol: dict[str, float] = {n: 0.0 for n in POKEMON_TOP_50_NAMES}
    for card_name, amount in rows:
        poke = _match_to_pokemon(card_name)
        if poke is not None:
            vol[poke] += float(amount or 0)
    return vol


@router.get("/top-pokemon-volume", response_model=PokemonVolumeResponse)
def get_top_pokemon_volume(
    timeframe: Literal["2026_ytd", "all_time", "30d"] = Query(
        default="2026_ytd", description="Observed market value timeframe"
    ),
    q: str | None = Query(default=None, description="Search Pokémon by name"),
    db: Session = Depends(get_db),
) -> PokemonVolumeResponse:
    """Top 50 Pokémon ranked by aggregated observed market value — computed live from the database.

    Volume = sum of all matching PriceObservation.price values within the selected timeframe.
    YoY = (current calendar year volume - prior calendar year volume) / prior year volume.
    Ranking is dynamic: sorted by computed volume descending.
    """
    cache_key = f"{timeframe}:{(q or '').strip().lower()}"
    now = datetime.now(UTC)

    if cache_key in _pokemon_volume_cache:
        cached_time, cached_res = _pokemon_volume_cache[cache_key]
        if (now - cached_time).total_seconds() < POKEMON_VOLUME_CACHE_TTL:
            return cached_res

    # --- Timeframe cutoff ---
    if timeframe == "2026_ytd":
        volume_cutoff: datetime | None = datetime(2026, 1, 1, tzinfo=UTC)
    elif timeframe == "30d":
        volume_cutoff = now - timedelta(days=30)
    else:  # all_time
        volume_cutoff = None

    # --- YoY reference windows ---
    current_year = now.year
    year_start = datetime(current_year, 1, 1, tzinfo=UTC)
    prev_year_start = datetime(current_year - 1, 1, 1, tzinfo=UTC)

    # 3 bulk queries — one per window.
    # Subtracting curr_yr from prev_yr gives last-year-only bucket.
    vol_by_pokemon = _bulk_pokemon_volume(db, volume_cutoff)
    curr_yr_vol = _bulk_pokemon_volume(db, year_start)
    prev_yr_vol = _bulk_pokemon_volume(db, prev_year_start)
    last_yr_by_pokemon = {
        n: prev_yr_vol[n] - curr_yr_vol[n]
        for n in POKEMON_TOP_50_NAMES
    }

    # --- Bulk Database Enrichment: card counts, top card, average price in 1 query ---
    name_filter = or_(*[Card.name.ilike(f"%{n}%") for n in POKEMON_TOP_50_NAMES])
    enrichment_rows = db.execute(
        select(Card.id, Card.name, PriceObservation.price)
        .outerjoin(PriceObservation, PriceObservation.card_id == Card.id)
        .where(name_filter, Card.name.not_ilike("%code card%"))
    ).all()

    cards_per_pokemon: dict[str, set[str]] = {n: set() for n in POKEMON_TOP_50_NAMES}
    price_totals: dict[str, float] = {n: 0.0 for n in POKEMON_TOP_50_NAMES}
    price_counts: dict[str, int] = {n: 0 for n in POKEMON_TOP_50_NAMES}
    top_cards: dict[str, tuple[str, str, float] | None] = {n: None for n in POKEMON_TOP_50_NAMES}

    for card_id, card_name, obs_price in enrichment_rows:
        poke = _match_to_pokemon(card_name)
        if poke is None:
            continue
        cards_per_pokemon[poke].add(card_id)
        if obs_price is not None:
            price_flt = float(obs_price)
            price_totals[poke] += price_flt
            price_counts[poke] += 1
            current_top = top_cards[poke]
            if current_top is None or price_flt > current_top[2]:
                top_cards[poke] = (card_id, card_name, price_flt)

    # --- Build items (unsorted) ---
    search_filter = (q or "").strip().lower()
    raw_items: list[dict[str, Any]] = []

    for poke_name in POKEMON_TOP_50_NAMES:
        if search_filter and search_filter not in poke_name.lower():
            continue

        volume_usd = vol_by_pokemon[poke_name]
        curr = curr_yr_vol[poke_name]
        last = last_yr_by_pokemon[poke_name]
        if last > 0:
            yoy_pct = round(((curr - last) / last) * 100, 1)
        else:
            yoy_pct = 0.0
        yoy_trend = "up" if yoy_pct > 1.0 else "down" if yoy_pct < -1.0 else "flat"

        cards_count = len(cards_per_pokemon[poke_name])
        p_count = price_counts[poke_name]
        avg_price = round(price_totals[poke_name] / p_count, 2) if p_count > 0 else None
        top_card = top_cards[poke_name]

        raw_items.append({
            "pokemon_name": poke_name,
            "volume_usd": volume_usd,
            "yoy_pct": yoy_pct,
            "yoy_trend": yoy_trend,
            "cards_count": cards_count,
            "avg_price": avg_price,
            "top_card_name": top_card[1] if top_card else None,
            "top_card_price": top_card[2] if top_card else None,
            "top_card_id": top_card[0] if top_card else None,
        })

    # --- Sort by volume descending, assign ranks ---
    raw_items.sort(key=lambda x: x["volume_usd"], reverse=True)

    total_vol = 0.0
    items: list[PokemonVolumeItem] = []
    for rank, entry in enumerate(raw_items, start=1):
        poke_name = entry["pokemon_name"]
        volume_usd = entry["volume_usd"]
        dex = POKEMON_DEX_NUMBERS.get(poke_name, 0)
        sprite_url = (
            f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/"
            f"pokemon/other/official-artwork/{dex}.png"
        )
        if volume_usd >= 1_000_000:
            volume_formatted = f"${volume_usd / 1_000_000:.1f}M"
        elif volume_usd >= 1_000:
            volume_formatted = f"${volume_usd / 1_000:.1f}K"
        else:
            volume_formatted = f"${volume_usd:,.2f}"
        total_vol += volume_usd
        items.append(
            PokemonVolumeItem(
                rank=rank,
                pokemon_name=poke_name,
                dex_number=dex,
                sprite_url=sprite_url,
                volume_usd=round(volume_usd, 2),
                volume_formatted=volume_formatted,
                yoy_percentage=entry["yoy_pct"],
                yoy_trend=entry["yoy_trend"],
                cards_count=entry["cards_count"],
                avg_card_price=entry["avg_price"],
                top_card_name=entry["top_card_name"],
                top_card_price=entry["top_card_price"],
                top_card_id=entry["top_card_id"],
            )
        )

    response = PokemonVolumeResponse(
        timeframe=timeframe,
        total_volume_usd=round(total_vol, 2),
        total_pokemon=len(items),
        items=items,
        updated_at=now,
    )
    _pokemon_volume_cache[cache_key] = (now, response)
    return response



@router.get("/live-updates", response_model=LiveUpdatesResponse)
def get_live_updates(
    provider: Literal["all", "ebay", "tcgapi"] = Query(default="all", description="Source provider filter"),
    grade_filter: Literal["all", "graded", "psa10", "psa9", "raw"] = Query(
        default="all", description="Grading filter"
    ),
    set_id: str | None = Query(default=None, description="Filter by set ID"),
    q: str | None = Query(default=None, description="Search card by name or number"),
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=24, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
) -> LiveUpdatesResponse:
    """Returns chronologically ordered live price observations and comp updates."""
    stmt = (
        select(PriceObservation, Card, Set)
        .join(Card, PriceObservation.card_id == Card.id)
        .join(Set, Card.set_id == Set.id)
        .where(
            Card.name.not_ilike("%code card%"),
            PriceObservation.price.is_not(None),
            PriceObservation.price > 0,
        )
    )

    # Provider filter
    if provider == "ebay":
        stmt = stmt.where(PriceObservation.provider.ilike("%ebay%"))
    elif provider == "tcgapi":
        stmt = stmt.where(PriceObservation.provider == "tcgapi")

    # Grade filter
    if grade_filter == "graded":
        stmt = stmt.where(PriceObservation.grading_company.is_not(None))
    elif grade_filter == "psa10":
        stmt = stmt.where(
            PriceObservation.grading_company == "PSA",
            PriceObservation.grade.in_(["10", 10, "10.0", 10.0]),
        )
    elif grade_filter == "psa9":
        stmt = stmt.where(
            PriceObservation.grading_company == "PSA",
            PriceObservation.grade.in_(["9", 9, "9.0", 9.0]),
        )
    elif grade_filter == "raw":
        stmt = stmt.where(PriceObservation.grading_company.is_(None))

    # Set filter
    if set_id:
        stmt = stmt.where(Card.set_id == set_id)

    # Search filter
    if q and q.strip():
        search_pattern = f"%{_escape_like(q.strip())}%"
        stmt = stmt.where(
            or_(
                Card.name.ilike(search_pattern, escape="\\"),
                Card.number.ilike(search_pattern, escape="\\"),
                Set.name.ilike(search_pattern, escape="\\"),
            )
        )

    # Total items count
    total_items = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    total_pages = max(1, math.ceil(total_items / per_page))

    # Summary KPI counts
    total_ebay = db.scalar(
        select(func.count(PriceObservation.id)).where(PriceObservation.provider.ilike("%ebay%"))
    ) or 0
    total_tcg = db.scalar(
        select(func.count(PriceObservation.id)).where(PriceObservation.provider == "tcgapi")
    ) or 0
    total_graded = db.scalar(
        select(func.count(PriceObservation.id)).where(PriceObservation.grading_company.is_not(None))
    ) or 0

    # Paginated results ordered by observed_at descending
    offset = (page - 1) * per_page
    rows = db.execute(
        stmt.order_by(PriceObservation.observed_at.desc(), PriceObservation.id.desc())
        .offset(offset)
        .limit(per_page)
    ).all()

    items: list[LiveUpdateItem] = []
    for obs, card, cset in rows:
        listing_title = None
        listing_url = None
        if isinstance(obs.payload, dict):
            listing_title = obs.payload.get("title") or obs.payload.get("item", {}).get("title")
            listing_url = (
                obs.payload.get("item_url")
                or obs.payload.get("item", {}).get("itemWebUrl")
                or obs.payload.get("item", {}).get("item_url")
            )

        items.append(
            LiveUpdateItem(
                id=str(obs.id),
                card_id=card.id,
                card_name=card.name,
                set_id=card.set_id,
                set_name=cset.name,
                number=card.number,
                rarity=card.rarity,
                image_url=f"/cards/{card.id}/image",
                provider=obs.provider,
                price=float(obs.price),
                currency=obs.currency or "USD",
                condition=obs.condition,
                printing=obs.printing,
                grading_company=obs.grading_company,
                grade=str(obs.grade) if obs.grade is not None else None,
                listing_title=listing_title,
                listing_url=listing_url,
                observed_at=obs.observed_at or obs.provider_updated_at or datetime.now(UTC),
            )
        )

    return LiveUpdatesResponse(
        page=page,
        per_page=per_page,
        total_items=total_items,
        total_pages=total_pages,
        provider_filter=provider,
        grade_filter=grade_filter,
        total_ebay_updates=total_ebay,
        total_tcg_updates=total_tcg,
        graded_updates_count=total_graded,
        items=items,
        updated_at=datetime.now(UTC),
    )


@router.get("/{card_id}", response_model=CardDetail)
def get_card(card_id: str, db: Session = Depends(get_db)) -> CardDetail:
    row = db.execute(
        select(Card, Set).join(Set, Card.set_id == Set.id).where(Card.id == card_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    card, card_set = row
    latest_synced = db.scalar(
        select(func.max(ProviderCardState.last_synced_at)).where(ProviderCardState.card_id == card_id)
    )
    summary = _summary(card, card_set, last_updated_at=latest_synced)
    return CardDetail(
        **summary.model_dump(),
        series=card_set.series,
        release_date=card_set.release_date,
    )


def _extract_float(payload: Any, key: str) -> float | None:
    if isinstance(payload, dict) and payload.get(key) is not None:
        try:
            return float(payload[key])
        except (ValueError, TypeError):
            return None
    return None


def _extract_listing_url(item: PriceObservation) -> str | None:
    if isinstance(item.payload, dict):
        raw_item = item.payload.get("item")
        if isinstance(raw_item, dict) and raw_item.get("itemWebUrl"):
            return str(raw_item["itemWebUrl"])
        if item.payload.get("itemWebUrl"):
            return str(item.payload["itemWebUrl"])
    if item.provider == "ebay" and item.provider_card_id:
        clean_id = item.provider_card_id.replace("v1|", "").split("|")[0]
        if clean_id.isdigit():
            return f"https://www.ebay.com/itm/{clean_id}"
    return None


@router.get("/{card_id}/prices", response_model=CardPricingResponse)
def get_card_prices(
    card_id: str,
    days: int = Query(default=365, ge=1, le=730),
    db: Session = Depends(get_db),
) -> CardPricingResponse:
    if db.get(Card, card_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    cutoff = datetime.now(UTC) - timedelta(days=days)
    states = list(db.scalars(
        select(ProviderCardState)
        .where(
            ProviderCardState.card_id == card_id,
            or_(
                ProviderCardState.provider == "tcgapi",
                ProviderCardState.provider.ilike("%ebay%"),
            ),
        )
        .order_by(ProviderCardState.provider)
    ))
    observations = list(db.scalars(
        select(PriceObservation)
        .where(
            PriceObservation.card_id == card_id,
            or_(
                PriceObservation.provider == "tcgapi",
                PriceObservation.provider.ilike("%ebay%"),
            ),
            or_(
                PriceObservation.provider_updated_at >= cutoff,
                PriceObservation.provider_updated_at.is_(None),
            ),
        )
        .order_by(PriceObservation.provider_updated_at, PriceObservation.id)
        .limit(3000)
    ))
    tcg_state = next((s for s in states if s.provider == "tcgapi"), None)
    tcg_price_map: dict[str, dict[str, Any]] = {}
    if tcg_state and isinstance(tcg_state.payload, dict):
        raw_prices = tcg_state.payload.get("prices")
        if isinstance(raw_prices, dict):
            pdata = raw_prices.get("data")
            if isinstance(pdata, list):
                for p in pdata:
                    if isinstance(p, dict) and p.get("printing"):
                        tcg_price_map[str(p["printing"]).lower()] = p
            elif isinstance(pdata, dict) and pdata.get("printing"):
                tcg_price_map[str(pdata["printing"]).lower()] = pdata

    def _resolve_obs_payload(item: PriceObservation) -> dict[str, Any]:
        """Merge pricing sub-fields from different payload shapes into a flat dict.

        sync_catalog observations store fields nested under a "variant" key.
        collect_prices observations store fields directly at the top level.
        This helper handles both, giving priority to top-level values when present.
        """
        res: dict[str, Any] = {}
        if item.provider == "tcgapi" and item.printing:
            mapped = tcg_price_map.get(item.printing.lower())
            if mapped:
                res.update(mapped)
        if isinstance(item.payload, dict):
            # Step 1: merge nested "variant" sub-key (written by sync_catalog.py)
            variant_data = item.payload.get("variant")
            if isinstance(variant_data, dict):
                for k, v in variant_data.items():
                    if k not in res or res.get(k) is None:
                        res[k] = v
            # Step 2: merge top-level keys (written by collect_prices.py, or new sync_catalog format)
            for k, v in item.payload.items():
                if k in ("variant", "raw_card"):
                    continue
                if v is not None or k not in res:
                    res[k] = v
        return res

    return CardPricingResponse(
        card_id=card_id,
        provider_states=[ProviderPricingState(
            provider=item.provider,
            match_status=item.match_status,
            last_synced_at=item.last_synced_at,
        ) for item in states],
        observations=[PriceObservationItem(
            provider=item.provider,
            provider_card_id=item.provider_card_id,
            variant_id=item.variant_id,
            condition=item.condition,
            printing=item.printing,
            grading_company=item.grading_company,
            grade=float(item.grade) if item.grade is not None else None,
            price=float(item.price),
            currency=item.currency,
            provider_updated_at=item.provider_updated_at,
            observed_at=item.observed_at,
            listing_url=_extract_listing_url(item),
            low_price=_extract_float(_resolve_obs_payload(item), "low_price"),
            median_price=_extract_float(_resolve_obs_payload(item), "median_price"),
            lowest_with_shipping=_extract_float(_resolve_obs_payload(item), "lowest_with_shipping"),
            buylist_price=_extract_float(_resolve_obs_payload(item), "buylist_price"),
            price_change_24h=_extract_float(_resolve_obs_payload(item), "price_change_24h"),
            price_change_7d=_extract_float(_resolve_obs_payload(item), "price_change_7d"),
            price_change_30d=_extract_float(_resolve_obs_payload(item), "price_change_30d"),
        ) for item in observations],
    )


_BROKEN_IMAGE_IDS: set[str] = set()
_PLACEHOLDER_SVG = (
    b'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560" fill="none">'
    b'<rect width="400" height="560" rx="16" fill="#1e293b"/>'
    b'<rect x="20" y="20" width="360" height="520" rx="12" stroke="#334155" stroke-width="2" stroke-dasharray="8 8"/>'
    b'<circle cx="200" cy="260" r="32" fill="#334155"/>'
    b'<path d="M190 260h20M200 250v20" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>'
    b'<text x="200" y="320" fill="#94a3b8" font-size="13" font-family="system-ui, -apple-system, sans-serif" font-weight="600" text-anchor="middle">Image Not Available</text>'
    b'</svg>'
)


@router.get("/{card_id}/image")
def get_card_image(
    card_id: str,
    db: Session = Depends(get_db),
    client: TCGAPIClient = Depends(get_tcgapi_client),
) -> Response:
    if card_id in _BROKEN_IMAGE_IDS:
        return Response(
            content=_PLACEHOLDER_SVG,
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    card = db.get(Card, card_id)
    if card is None or not card.image_url:
        return Response(
            content=_PLACEHOLDER_SVG,
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    try:
        content, content_type = client.get_image(card.image_url)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            _BROKEN_IMAGE_IDS.add(card_id)
            logger.info("Card image not found upstream card_id=%s url=%s; caching 404 fallback", card_id, card.image_url)
            return Response(
                content=_PLACEHOLDER_SVG,
                media_type="image/svg+xml",
                headers={"Cache-Control": "public, max-age=86400"},
            )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Image provider rejected request") from exc
    except (httpx.RequestError, ValueError) as exc:
        _BROKEN_IMAGE_IDS.add(card_id)
        logger.warning("Card image request failed card_id=%s error=%s: %s; serving placeholder", card_id, type(exc).__name__, exc)
        return Response(
            content=_PLACEHOLDER_SVG,
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    return Response(
        content=content,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "CDN-Cache-Control": "public, max-age=31536000, immutable",
        },
    )
