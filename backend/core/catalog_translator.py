import csv
import json
import os
from pathlib import Path
from typing import Any

from models.schemas import Product

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Known column-name synonyms per merchant, keyed by our standard Product field.
FIELD_ALIASES: dict[str, list[str]] = {
    "product_id": ["product_id", "item_code", "id", "sku", "code"],
    "name": ["name", "item_name", "product_title", "title"],
    "price_inr": ["price_inr", "list_price", "price", "cost"],
    "stock": ["stock", "units_in_stock", "stock_count", "quantity", "qty"],
    "category": ["category", "dept", "product_type", "type"],
    "description": ["description", "blurb", "notes", "desc"],
    "return_policy": ["return_policy", "returns_info", "return_days"],
    "max_qty_per_order": ["max_qty_per_order", "order_limit", "qty_limit", "max_qty"],
}

REQUIRED_FIELDS = list(FIELD_ALIASES.keys())


class CatalogTranslationError(Exception):
    pass


def _load_raw_records(catalog_file: str) -> list[dict[str, Any]]:
    path = (DATA_DIR / catalog_file).resolve()
    if DATA_DIR not in path.parents or not path.exists():
        raise CatalogTranslationError(f"Catalog file not found: {catalog_file}")

    if path.suffix == ".csv":
        with path.open(newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    if path.suffix == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            return payload
        for value in payload.values():
            if isinstance(value, list):
                return value
        raise CatalogTranslationError(f"No inventory list found in {catalog_file}")

    raise CatalogTranslationError(f"Unsupported catalog file type: {path.suffix}")


def _build_field_map(source_columns: list[str]) -> dict[str, str]:
    lower_columns = {col.lower(): col for col in source_columns}

    field_map: dict[str, str] = {}
    for target_field, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            if alias in lower_columns:
                field_map[target_field] = lower_columns[alias]
                break

    missing = [f for f in REQUIRED_FIELDS if f not in field_map]
    if missing:
        field_map.update(_llm_field_map(source_columns, missing))

    still_missing = [f for f in REQUIRED_FIELDS if f not in field_map]
    if still_missing:
        raise CatalogTranslationError(
            f"Could not map fields {still_missing} from source columns {source_columns}"
        )

    return field_map


def _llm_field_map(source_columns: list[str], missing_fields: list[str]) -> dict[str, str]:
    """Best-effort fallback for merchant schemas the alias table doesn't cover."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {}

    from groq import Groq

    client = Groq(api_key=api_key)
    prompt = (
        "You are mapping a merchant's product catalog columns onto a standard schema. "
        f"Standard fields needing a source column: {missing_fields}. "
        f"Available source columns: {source_columns}. "
        "Reply with ONLY a JSON object mapping each standard field to the best-matching "
        "source column name, no prose. Omit a field if no reasonable match exists."
    )
    response = client.chat.completions.create(
        model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )
    try:
        mapping = json.loads(response.choices[0].message.content)
    except (json.JSONDecodeError, IndexError, AttributeError, KeyError):
        return {}

    return {
        field: column
        for field, column in mapping.items()
        if field in missing_fields and column in source_columns
    }


def _coerce_return_policy(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        days = int(value)
    except (TypeError, ValueError):
        return str(value)
    return "No returns" if days == 0 else f"{days}-day return"


def translate_catalog(catalog_file: str) -> list[Product]:
    """Load a merchant catalog file (csv/json, arbitrary column names) and
    normalize every row into our standard Product schema."""
    records = _load_raw_records(catalog_file)
    if not records:
        return []

    field_map = _build_field_map(list(records[0].keys()))

    products = []
    for record in records:
        products.append(
            Product(
                product_id=str(record[field_map["product_id"]]),
                name=str(record[field_map["name"]]),
                price_inr=float(record[field_map["price_inr"]]),
                stock=int(record[field_map["stock"]]),
                category=str(record[field_map["category"]]).strip().lower(),
                description=str(record[field_map["description"]]),
                return_policy=_coerce_return_policy(record[field_map["return_policy"]]),
                max_qty_per_order=int(record[field_map["max_qty_per_order"]]),
            )
        )
    return products
