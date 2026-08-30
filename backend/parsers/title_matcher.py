import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Any, Literal

logger = logging.getLogger(__name__)

MatchStatus = Literal["matched", "rejected", "uncertain"]


class RejectionReason(str, Enum):
    PROXY_OR_FAKE = "proxy_or_fake"
    MERCHANDISE_OR_SEALED = "merchandise_or_sealed"
    LOT_OR_BUNDLE = "lot_or_bundle"
    DIGITAL_OR_CODE = "digital_or_code"
    FOREIGN_LANGUAGE = "foreign_language"
    ALTERED_OR_AUTOGRAPH = "altered_or_autograph"
    GRADE_HYPE_OR_UNCERTAIN = "grade_hype_or_uncertain"
    CARD_NAME_MISMATCH = "card_name_mismatch"
    CARD_NUMBER_MISMATCH = "card_number_mismatch"
    SET_NAME_MISMATCH = "set_name_mismatch"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


# Negative keyword pattern definitions
RE_ALTERED_AUTO = re.compile(
    r"\b(autographed?|auto\b|signed|signature|hand\s*signed|altered|"
    r"extended\s*art|custom\s*painted|custom\s*art|painted)\b",
    re.IGNORECASE,
)

RE_PROXY_FAKE = re.compile(
    r"\b(proxy|proxies|custom|replica|replicas|reproduction|reproductions|"
    r"fan\s*art|orica|bootleg|fake|fakes|reprint|reprints|metal\s*card|"
    r"gold\s*metal|handmade|hand\s*made|facsimile)\b",
    re.IGNORECASE,
)

RE_MERCHANDISE = re.compile(
    r"\b(booster\s*pack|booster\s*box|booster\s*packs|booster\s*boxes|"
    r"etb|elite\s*trainer\s*box|tin\b|tins\b|blister|blisters|binder|binders|"
    r"deck\s*box|sleeves|coin|pins\b|pin\b|empty\s*box|empty\s*tin|"
    r"empty\s*pack|empty\s*slab|display\s*only|stand\s*only|box\s*only|"
    r"pack\s*art|booster\s*art|upc\b|ultra\s*premium\s*collection|sealed\s*case)\b",
    re.IGNORECASE,
)

RE_LOT_BUNDLE = re.compile(
    r"\b(lot\b|lots\b|bundle\b|bundles\b|bulk\b|mystery\s*box|"
    r"mystery\s*pack|set\s*of\s*\d+|\d+\s*card\s*lot|\d+\s*cards\b)",
    re.IGNORECASE,
)

RE_DIGITAL_CODE = re.compile(
    r"\b(digital|tcgo|ptcgo|ptcgl|live\s*code|online\s*code|code\s*card|"
    r"online\s*qr|tcg\s*live\s*code)\b",
    re.IGNORECASE,
)

RE_FOREIGN = re.compile(
    r"\b(japanese|japan\b|jp\b|jpn\b|korean|kor\b|spanish|spa\b|german|ger\b|"
    r"deutsch|french|fra\b|italian|ita\b|chinese|china\b|chn\b|traditional\s*chinese|"
    r"simplified\s*chinese)\b",
    re.IGNORECASE,
)

# Reject hype phrases that attempt to sell raw cards with hypothetical PSA 10 claims
# Note: we do not end with \b on question marks since ? is not a word char.
RE_GRADE_HYPE = re.compile(
    r"(\bpsa\s*10\?|\bbgs\s*10\?|\bcgc\s*10\?|\bsgc\s*10\?|\bpsa\s*9\?|"
    r"\bpsa\s*10\s*candidate\b|\bbgs\s*10\s*candidate\b|\bcgc\s*10\s*candidate\b|"
    r"\bpsa\s*10\s*potential\b|\bpsa\s*10\s*ready\b|\bpsa\s*10\s*gradeable\b|"
    r"\bpsa\s*ready\b|\bbgs\s*ready\b|\bcgc\s*ready\b|\bgrade\s*candidate\b|\bgrading\s*candidate\b|"
    r"\bgem\s*mint\?|\bmint\?|\bpotential\s*10\b|\bpotential\s*psa\b|\bpsa\s*gradeable\b|"
    r"\blooks\s*like\s*psa\s*10\b|\bpossible\s*psa\s*10\b|\bpossible\s*10\b)",
    re.IGNORECASE,
)

# Grade extraction patterns
RE_PSA_GRADE = re.compile(
    r"\bPSA\s*(?:GEM[- ]?MT|MINT|NM[- ]?MT|EX[- ]?MT|EX|VG|GOOD|PR)?\s*"
    r"([1-9]|10)(?:\.([05]))?\b",
    re.IGNORECASE,
)
RE_PSA_AUTHENTIC = re.compile(r"\bPSA\s*(?:Authentic|Auth)\b", re.IGNORECASE)

RE_BGS_GRADE = re.compile(
    r"\b(?:BGS|Beckett)\s*(?:PRISTINE|GEM[- ]?MINT|MINT|NM[- ]?MT)?\s*"
    r"([1-9]|10)(?:\.([05]))?\b",
    re.IGNORECASE,
)
RE_BGS_AUTHENTIC = re.compile(r"\b(?:BGS|Beckett)\s*(?:Authentic|Auth)\b", re.IGNORECASE)

RE_CGC_GRADE = re.compile(
    r"\bCGC\s*(?:PRISTINE|GEM[- ]?MINT|GEM|MINT|NM[- ]?MT)?\s*"
    r"([1-9]|10)(?:\.([05]))?\b",
    re.IGNORECASE,
)
RE_CGC_AUTHENTIC = re.compile(r"\bCGC\s*(?:Authentic|Auth)\b", re.IGNORECASE)

RE_SGC_GRADE = re.compile(
    r"\bSGC\s*(?:PRISTINE|GEM[- ]?MINT|MINT)?\s*"
    r"([1-9]|10)(?:\.([05]))?\b",
    re.IGNORECASE,
)
RE_SGC_OLD_SCALE = re.compile(r"\bSGC\s*(100|98|96|92|88|86|84|80|70)\b", re.IGNORECASE)
RE_SGC_AUTHENTIC = re.compile(r"\bSGC\s*(?:Authentic|Auth)\b", re.IGNORECASE)

# Old SGC point scale mapping
SGC_SCALE_MAP: dict[str, Decimal] = {
    "100": Decimal("10.0"),
    "98": Decimal("10.0"),
    "96": Decimal("9.0"),
    "92": Decimal("8.5"),
    "88": Decimal("8.0"),
    "86": Decimal("7.5"),
    "84": Decimal("7.0"),
    "80": Decimal("6.0"),
    "70": Decimal("5.0"),
}

# Raw condition indicators
RE_RAW_CONDITION = re.compile(
    r"\b(near\s*mint|nm[- ]?mint|nm\b|lightly\s*played|lp\b|moderately\s*played|"
    r"mp\b|heavily\s*played|hp\b|damaged|dmg\b|mint\b|gem\s*mint)\b",
    re.IGNORECASE,
)

# Printing variants
RE_FIRST_EDITION = re.compile(r"\b(1st\s*edition|1st\s*ed\b|first\s*edition)\b", re.IGNORECASE)
RE_SHADOWLESS = re.compile(r"\b(shadowless)\b", re.IGNORECASE)
RE_REVERSE_HOLO = re.compile(r"\b(reverse\s*holo|reverse\s*foil|reverse\s*holofoil|rev\s*holo)\b", re.IGNORECASE)
RE_UNLIMITED = re.compile(r"\b(unlimited)\b", re.IGNORECASE)
RE_HOLO = re.compile(r"\b(holofoil|holo\b|foil\b)\b", re.IGNORECASE)


@dataclass(frozen=True)
class ParsedGrade:
    grading_company: str  # "PSA", "BGS", "CGC", "SGC"
    grade: Decimal | None
    is_authentic: bool = False
    qualifier: str | None = None


@dataclass
class TitleMatchResult:
    status: MatchStatus
    rejection_reason: str | None = None
    is_graded: bool = False
    grading_company: str | None = None
    grade: Decimal | None = None
    condition: str | None = None
    printing: str | None = None
    extracted_number: str | None = None
    confidence: float = 0.0
    details: dict[str, Any] = field(default_factory=dict)


def normalize_tokens(text: str) -> str:
    """Normalize text into lower-case alphanumeric tokens with single whitespace."""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def normalize_card_number(number_str: str) -> str:
    """Normalize card numbers like '004/102', '#4', '4', 'GG36/GG70' into base number."""
    first = str(number_str or "").split("/", 1)[0].strip()
    first_clean = re.sub(r"^#\s*", "", first).strip().lower()
    # Strip leading zeroes if pure integer: "004" -> "4"
    if first_clean.isdigit():
        return first_clean.lstrip("0") or "0"
    return first_clean


def extract_numbers_from_title(title: str) -> list[str]:
    """Extract candidate card numbers from a listing title."""
    found: list[str] = []
    # 1. Look for explicit fractional patterns like 4/102, 004/102, GG36/GG70, TG01/TG30
    for match in re.finditer(r"(?:#|\b)([A-Za-z0-9-]+)\s*/\s*([0-9A-Za-z]+)\b", title):
        numerator = match.group(1).strip().lstrip("#").lower()
        if numerator.isdigit():
            numerator = numerator.lstrip("0") or "0"
        found.append(numerator)

    # 2. Look for prefixed hash patterns like #4, #004, #SWSH050
    for match in re.finditer(r"#\s*([A-Za-z0-9-]+)\b", title):
        num = match.group(1).strip().lower()
        if num.isdigit():
            num = num.lstrip("0") or "0"
        if num not in found:
            found.append(num)

    # 3. Look for standalone promo numbers like SWSH050, SVP001, SM201, XY123
    for match in re.finditer(r"\b(SWSH\d{3}|SVP\d{3}|SM\d{3}|XY\d{3}|BW\d{2}|DP\d{2}|HGSS\d{2})\b", title, re.IGNORECASE):
        num = match.group(1).strip().lower()
        if num not in found:
            found.append(num)

    # 4. Look for Galarian / Trainer Gallery patterns: GG01, TG01
    for match in re.finditer(r"\b([TG|GG]\d{2})\b", title, re.IGNORECASE):
        num = match.group(1).strip().lower()
        if num not in found:
            found.append(num)

    return found


def extract_grade_from_title(title: str) -> ParsedGrade | None:
    """Extract authentic graded slab details (PSA, BGS, CGC, SGC)."""
    # 1. PSA
    psa_match = RE_PSA_GRADE.search(title)
    if psa_match:
        whole = psa_match.group(1)
        dec = psa_match.group(2)
        grade_val = f"{whole}.{dec}" if dec else f"{whole}.0"
        try:
            return ParsedGrade(
                grading_company="PSA",
                grade=Decimal(grade_val),
                qualifier="Gem Mint" if whole == "10" else None,
            )
        except InvalidOperation as exc:
            logger.warning("Invalid PSA grade decimal title=%s error=%s: %s", title, type(exc).__name__, exc)
    elif RE_PSA_AUTHENTIC.search(title):
        return ParsedGrade(grading_company="PSA", grade=None, is_authentic=True)

    # 2. BGS (Beckett)
    bgs_match = RE_BGS_GRADE.search(title)
    if bgs_match:
        whole = bgs_match.group(1)
        dec = bgs_match.group(2)
        grade_val = f"{whole}.{dec}" if dec else f"{whole}.0"
        try:
            return ParsedGrade(
                grading_company="BGS",
                grade=Decimal(grade_val),
                qualifier="Pristine" if whole == "10" and (not dec or dec == "0") else None,
            )
        except InvalidOperation as exc:
            logger.warning("Invalid BGS grade decimal title=%s error=%s: %s", title, type(exc).__name__, exc)
    elif RE_BGS_AUTHENTIC.search(title):
        return ParsedGrade(grading_company="BGS", grade=None, is_authentic=True)

    # 3. CGC
    cgc_match = RE_CGC_GRADE.search(title)
    if cgc_match:
        whole = cgc_match.group(1)
        dec = cgc_match.group(2)
        grade_val = f"{whole}.{dec}" if dec else f"{whole}.0"
        try:
            return ParsedGrade(
                grading_company="CGC",
                grade=Decimal(grade_val),
            )
        except InvalidOperation as exc:
            logger.warning("Invalid CGC grade decimal title=%s error=%s: %s", title, type(exc).__name__, exc)
    elif RE_CGC_AUTHENTIC.search(title):
        return ParsedGrade(grading_company="CGC", grade=None, is_authentic=True)

    # 4. SGC
    sgc_match = RE_SGC_GRADE.search(title)
    if sgc_match:
        whole = sgc_match.group(1)
        dec = sgc_match.group(2)
        grade_val = f"{whole}.{dec}" if dec else f"{whole}.0"
        try:
            return ParsedGrade(
                grading_company="SGC",
                grade=Decimal(grade_val),
            )
        except InvalidOperation as exc:
            logger.warning("Invalid SGC grade decimal title=%s error=%s: %s", title, type(exc).__name__, exc)
    sgc_old = RE_SGC_OLD_SCALE.search(title)
    if sgc_old:
        val_str = sgc_old.group(1)
        if val_str in SGC_SCALE_MAP:
            return ParsedGrade(
                grading_company="SGC",
                grade=SGC_SCALE_MAP[val_str],
            )
    elif RE_SGC_AUTHENTIC.search(title):
        return ParsedGrade(grading_company="SGC", grade=None, is_authentic=True)

    return None


def extract_printing_from_title(title: str) -> str:
    """Extract printing variant from title."""
    if RE_FIRST_EDITION.search(title):
        return "1st Edition"
    if RE_SHADOWLESS.search(title):
        return "Shadowless"
    if RE_REVERSE_HOLO.search(title):
        return "Reverse Holofoil"
    if RE_UNLIMITED.search(title):
        return "Unlimited"
    if RE_HOLO.search(title):
        return "Holofoil"
    return "Standard"


def extract_raw_condition_from_title(title: str) -> str:
    """Extract raw card condition if present."""
    match = RE_RAW_CONDITION.search(title)
    if not match:
        return "Raw"
    token = match.group(1).lower()
    if "near" in token or token in ("nm", "nm-mint", "mint", "gem mint"):
        return "Near Mint"
    if "lightly" in token or token == "lp":
        return "Lightly Played"
    if "moderately" in token or token == "mp":
        return "Moderately Played"
    if "heavily" in token or token == "hp":
        return "Heavily Played"
    if "damaged" in token or token == "dmg":
        return "Damaged"
    return "Raw"


def parse_ebay_title(
    title: str,
    target_card_name: str,
    target_card_number: str,
    target_set_name: str,
    *,
    is_target_japanese: bool = False,
) -> TitleMatchResult:
    """
    Parse an eBay listing title against a target canonical card.
    
    Returns a TitleMatchResult with status 'matched', 'rejected', or 'uncertain'
    and full diagnostic audit details.
    """
    clean_title = (title or "").strip()
    if not clean_title:
        return TitleMatchResult(
            status="rejected",
            rejection_reason=RejectionReason.INSUFFICIENT_EVIDENCE.value,
        )

    # 1. Hard Rejections on Negative Keywords
    # A. Altered / Autographed
    if RE_ALTERED_AUTO.search(clean_title):
        return TitleMatchResult(
            status="rejected",
            rejection_reason=RejectionReason.ALTERED_OR_AUTOGRAPH.value,
            details={"title": clean_title},
        )

    # B. Proxy / Fake
    if RE_PROXY_FAKE.search(clean_title):
        return TitleMatchResult(
            status="rejected",
            rejection_reason=RejectionReason.PROXY_OR_FAKE.value,
            details={"title": clean_title},
        )

    # C. Merchandise / Sealed
    if RE_MERCHANDISE.search(clean_title):
        return TitleMatchResult(
            status="rejected",
            rejection_reason=RejectionReason.MERCHANDISE_OR_SEALED.value,
            details={"title": clean_title},
        )

    # D. Lot / Bundle (exclude 'collection' if part of target set name)
    if RE_LOT_BUNDLE.search(clean_title):
        return TitleMatchResult(
            status="rejected",
            rejection_reason=RejectionReason.LOT_OR_BUNDLE.value,
            details={"title": clean_title},
        )
    if re.search(r"\bcollection\b", clean_title, re.IGNORECASE):
        if "collection" not in target_set_name.lower():
            return TitleMatchResult(
                status="rejected",
                rejection_reason=RejectionReason.LOT_OR_BUNDLE.value,
                details={"title": clean_title},
            )

    # E. Digital / Code Cards
    if RE_DIGITAL_CODE.search(clean_title):
        return TitleMatchResult(
            status="rejected",
            rejection_reason=RejectionReason.DIGITAL_OR_CODE.value,
            details={"title": clean_title},
        )

    # F. Foreign language (for English targets)
    if not is_target_japanese and RE_FOREIGN.search(clean_title):
        return TitleMatchResult(
            status="rejected",
            rejection_reason=RejectionReason.FOREIGN_LANGUAGE.value,
            details={"title": clean_title},
        )

    # 2. Reject aspirational / hype grade titles on raw cards
    if RE_GRADE_HYPE.search(clean_title):
        return TitleMatchResult(
            status="rejected",
            rejection_reason=RejectionReason.GRADE_HYPE_OR_UNCERTAIN.value,
            details={"title": clean_title},
        )

    # 3. Card Name Matching
    norm_title = normalize_tokens(clean_title)
    norm_target_name = normalize_tokens(target_card_name)

    # Target name tokens must all be present in title
    target_tokens = norm_target_name.split()
    for token in target_tokens:
        if token not in norm_title.split():
            return TitleMatchResult(
                status="rejected",
                rejection_reason=RejectionReason.CARD_NAME_MISMATCH.value,
                details={"target_name": target_card_name, "title": clean_title},
            )

    # Check for character prefixes that create distinct card entities:
    # e.g., "Dark Charizard", "Shining Charizard", "Light Charizard", "Radiant Charizard", "Blaine's Charizard"
    entity_prefixes = ["dark", "light", "shining", "radiant", "blaine s", "erika s", "brock s", "misty s", "giovanni s", "sabrina s", "koga s", "lt surge s"]
    for prefix in entity_prefixes:
        # Check if the prefix appears immediately before or associated with the card name (not e.g. "lightly played")
        pattern = rf"\b{re.escape(prefix)}\s+{re.escape(target_tokens[0])}\b"
        if re.search(pattern, norm_title) and not re.search(pattern, norm_target_name):
            return TitleMatchResult(
                status="rejected",
                rejection_reason=RejectionReason.CARD_NAME_MISMATCH.value,
                details={"disallowed_prefix": prefix, "target_name": target_card_name, "title": clean_title},
            )

    # 4. Card Number Verification
    expected_number = normalize_card_number(target_card_number)
    extracted_numbers = extract_numbers_from_title(clean_title)

    if extracted_numbers:
        if expected_number not in extracted_numbers:
            return TitleMatchResult(
                status="rejected",
                rejection_reason=RejectionReason.CARD_NUMBER_MISMATCH.value,
                details={"expected_number": expected_number, "found_numbers": extracted_numbers},
            )
        matched_number = expected_number
    else:
        # If no explicit number pattern found, check if number appears as lone word
        if expected_number.isdigit() and expected_number in norm_title.split():
            matched_number = expected_number
        elif expected_number.lower() in norm_title.split():
            matched_number = expected_number
        else:
            matched_number = None

    # 5. Extract Grade or Raw Condition
    parsed_grade = extract_grade_from_title(clean_title)
    printing = extract_printing_from_title(clean_title)

    if parsed_grade:
        return TitleMatchResult(
            status="matched",
            is_graded=True,
            grading_company=parsed_grade.grading_company,
            grade=parsed_grade.grade,
            printing=printing,
            extracted_number=matched_number,
            confidence=0.95 if matched_number else 0.85,
            details={
                "slab": parsed_grade.grading_company,
                "grade": str(parsed_grade.grade) if parsed_grade.grade is not None else "Authentic",
                "qualifier": parsed_grade.qualifier,
            },
        )

    # Raw card match
    raw_condition = extract_raw_condition_from_title(clean_title)
    return TitleMatchResult(
        status="matched",
        is_graded=False,
        condition=raw_condition,
        printing=printing,
        extracted_number=matched_number,
        confidence=0.90 if matched_number else 0.80,
        details={"condition": raw_condition, "printing": printing},
    )
