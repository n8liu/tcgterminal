import httpx
import pytest
import respx

from app.tcgapi.client import (
    DEFAULT_BASE_URL,
    TCGAPIClient,
    TCGAPIConfigurationError,
    local_card_id,
    parse_release_date,
    split_card_number,
)


@respx.mock
def test_iter_sets_uses_pokemon_filter_and_api_key() -> None:
    route = respx.get(f"{DEFAULT_BASE_URL}/sets").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [{"id": 1234, "name": "Obsidian Flames"}],
                "meta": {"has_more": False},
            },
        )
    )
    result = list(TCGAPIClient(api_key="secret", acquire_request=lambda: None).iter_sets())
    assert result == [{"id": 1234, "name": "Obsidian Flames"}]
    request = route.calls[0].request
    assert request.headers["X-API-Key"] == "secret"
    assert request.url.params["game"] == "pokemon"
    assert request.url.params["per_page"] == "100"


@respx.mock
def test_iter_cards_paginates_set_cards() -> None:
    route = respx.get(f"{DEFAULT_BASE_URL}/sets/1234/cards").mock(
        side_effect=[
            httpx.Response(
                200,
                json={"data": [{"id": 1}], "meta": {"has_more": True}},
            ),
            httpx.Response(
                200,
                json={"data": [{"id": 2}], "meta": {"has_more": False}},
            ),
        ]
    )
    result = list(
        TCGAPIClient(api_key="secret", acquire_request=lambda: None).iter_cards(["1234"])
    )
    assert result == [{"id": 1, "_set_id": "1234"}, {"id": 2, "_set_id": "1234"}]
    assert route.calls[1].request.url.params["page"] == "2"


@respx.mock
def test_get_card_prices_retries_429_then_succeeds() -> None:
    route = respx.get(f"{DEFAULT_BASE_URL}/cards/123/prices").mock(
        side_effect=[
            httpx.Response(429, text="rate limited"),
            httpx.Response(200, json={"data": []}),
        ]
    )
    sleeps: list[float] = []
    result = TCGAPIClient(
        api_key="secret",
        sleep=sleeps.append,
        acquire_request=lambda: None,
    ).get_card_prices("123", printing="Normal")
    assert result == {"data": []}
    assert route.call_count == 2
    assert sleeps == [1]
    assert route.calls[0].request.url.params["printing"] == "Normal"


@respx.mock
def test_get_top_movers_passes_parameters() -> None:
    route = respx.get(f"{DEFAULT_BASE_URL}/prices/top-movers").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "card_id": 12345,
                        "name": "Charizard ex",
                        "set_name": "Obsidian Flames",
                        "printing": "Normal",
                        "market_price": 24.99,
                        "price_change": 15.5,
                    }
                ]
            },
        )
    )
    client = TCGAPIClient(api_key="secret", acquire_request=lambda: None)
    result = client.get_top_movers(
        game="pokemon",
        direction="up",
        period="24h",
        printing="Normal",
        type="Cards",
        limit=10,
    )
    assert len(result["data"]) == 1
    request = route.calls[0].request
    assert request.headers["X-API-Key"] == "secret"
    assert request.url.params["game"] == "pokemon"
    assert request.url.params["direction"] == "up"
    assert request.url.params["period"] == "24h"
    assert request.url.params["printing"] == "Normal"
    assert request.url.params["type"] == "Cards"
    assert request.url.params["limit"] == "10"


@respx.mock
def test_get_bulk_prices_passes_ids() -> None:
    route = respx.get(f"{DEFAULT_BASE_URL}/bulk/prices").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"card_id": 1, "market_price": 10.0}, {"card_id": 2, "market_price": 20.0}]},
        )
    )
    client = TCGAPIClient(api_key="secret", acquire_request=lambda: None)
    result = client.get_bulk_prices(["1", "2"])
    assert len(result["data"]) == 2
    request = route.calls[0].request
    assert request.headers["X-API-Key"] == "secret"
    assert request.url.params["ids"] == "1,2"


def test_missing_key_fails_before_request() -> None:
    with pytest.raises(TCGAPIConfigurationError, match="TCGAPI_API_KEY"):
        TCGAPIClient(api_key="", acquire_request=lambda: None).get_card("123")


def test_catalog_value_helpers() -> None:
    assert parse_release_date("2023-08-11").isoformat() == "2023-08-11"
    assert parse_release_date("not-a-date") is None
    assert split_card_number("223/203", 230) == ("223", 203)
    assert split_card_number("006", 230) == ("006", 230)
    source_id = "tcg_" + ("a" * 88)
    assert len(local_card_id(source_id)) == 64
    assert local_card_id(source_id) == local_card_id(source_id)


def test_get_image_rejects_unapproved_ssrf_domains() -> None:
    client = TCGAPIClient(api_key="secret", acquire_request=lambda: None)
    with pytest.raises(ValueError, match="not in the approved image domain allowlist"):
        client.get_image("http://169.254.169.254/latest/meta-data")

    with pytest.raises(ValueError, match="not in the approved image domain allowlist"):
        client.get_image("https://malicious-site.com/image.png")


@respx.mock
def test_get_image_allows_approved_domains() -> None:
    respx.get("https://images.pokemontcg.io/base1/4.png").respond(
        200,
        content=b"image-content",
        headers={"Content-Type": "image/png"},
    )
    client = TCGAPIClient(api_key="secret", acquire_request=lambda: None)
    content, content_type = client.get_image("https://images.pokemontcg.io/base1/4.png")
    assert content == b"image-content"
    assert content_type == "image/png"
