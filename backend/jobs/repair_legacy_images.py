import argparse
import logging
import re
from collections import defaultdict
from dataclasses import asdict, dataclass
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Card, Set
from app.tcgapi import TCGAPIClient
from app.tcgapi.client import split_card_number

logger = logging.getLogger(__name__)
LEGACY_IMAGE_HOSTS = {"api.pokewallet.io"}
NUMBER_SUFFIX = re.compile(r"\s+-\s+[^\s]+/[^\s]+\s*$")


@dataclass(frozen=True)
class RepairResult:
    matched_sets: int
    legacy_cards: int
    candidates: int
    unmatched: int
    ambiguous: int
    applied: int


def _normalized_name(value: object) -> str:
    return " ".join(NUMBER_SUFFIX.sub("", str(value or "")).casefold().split())


def _normalized_number(value: object) -> str:
    number = str(value or "").strip().casefold()
    if number.isdigit():
        return number.lstrip("0") or "0"
    return number


def _card_key(name: object, number: object) -> tuple[str, str]:
    return _normalized_name(name), _normalized_number(number)


def _replacement_url(value: object) -> str | None:
    url = str(value or "").strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.netloc in LEGACY_IMAGE_HOSTS:
        return None
    return url


def repair_legacy_images(
    session: Session,
    client: TCGAPIClient,
    *,
    apply_changes: bool = False,
) -> RepairResult:
    local_sets = list(session.scalars(select(Set)))
    local_sets_by_name: dict[str, list[Set]] = defaultdict(list)
    for card_set in local_sets:
        local_sets_by_name[card_set.name].append(card_set)

    remote_sets_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in client.iter_sets():
        name = item.get("name")
        if isinstance(name, str):
            remote_sets_by_name[name].append(item)

    set_pairs: list[tuple[Set, dict[str, Any]]] = []
    for name, matching_local_sets in local_sets_by_name.items():
        matching_remote_sets = remote_sets_by_name.get(name, [])
        if len(matching_local_sets) == 1 and len(matching_remote_sets) == 1:
            set_pairs.append((matching_local_sets[0], matching_remote_sets[0]))

    remote_set_ids = [str(remote["id"]) for _, remote in set_pairs]
    remote_cards_by_set: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in client.iter_cards(remote_set_ids):
        remote_cards_by_set[str(item["_set_id"])].append(item)

    legacy_cards = 0
    candidates: list[tuple[Card, str]] = []
    unmatched = 0
    ambiguous = 0
    for local_set, remote_set in set_pairs:
        remote_index: dict[tuple[str, str], list[str]] = defaultdict(list)
        for item in remote_cards_by_set[str(remote_set["id"])]:
            number, _ = split_card_number(item.get("number"), remote_set.get("card_count"))
            replacement = _replacement_url(item.get("image_url"))
            if replacement:
                remote_index[_card_key(item.get("name"), number)].append(replacement)

        local_cards = list(session.scalars(select(Card).where(Card.set_id == local_set.id)))
        for card in local_cards:
            if urlparse(card.image_url or "").netloc not in LEGACY_IMAGE_HOSTS:
                continue
            legacy_cards += 1
            replacements = list(dict.fromkeys(remote_index.get(_card_key(card.name, card.number), [])))
            if not replacements:
                unmatched += 1
            elif len(replacements) > 1:
                ambiguous += 1
            else:
                candidates.append((card, replacements[0]))

    logger.info(
        "Legacy image repair prepared matched_sets=%s legacy_cards=%s candidates=%s "
        "unmatched=%s ambiguous=%s apply=%s",
        len(set_pairs),
        legacy_cards,
        len(candidates),
        unmatched,
        ambiguous,
        apply_changes,
    )
    if apply_changes:
        for card, replacement in candidates:
            card.image_url = replacement
        session.commit()

    return RepairResult(
        matched_sets=len(set_pairs),
        legacy_cards=legacy_cards,
        candidates=len(candidates),
        unmatched=unmatched,
        ambiguous=ambiguous,
        applied=len(candidates) if apply_changes else 0,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Replace exact-match legacy card image URLs")
    parser.add_argument("--apply", action="store_true", help="Commit validated replacements")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    with SessionLocal() as session:
        result = repair_legacy_images(session, TCGAPIClient(), apply_changes=args.apply)
    logger.info("Legacy image repair finished result=%s", asdict(result))


if __name__ == "__main__":
    main()
