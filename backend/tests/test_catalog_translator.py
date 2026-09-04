import csv
import json

import pytest

from core.catalog_translator import CatalogTranslationError, translate_catalog


def _write_csv(path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


@pytest.fixture
def data_dir(monkeypatch, tmp_path):
    monkeypatch.setattr("core.catalog_translator.DATA_DIR", tmp_path)
    return tmp_path


def test_translates_csv_with_standard_column_names(data_dir):
    _write_csv(
        data_dir / "standard.csv",
        [
            {
                "product_id": "sku-1",
                "name": "Mouse",
                "price_inr": "999.5",
                "stock": "10",
                "category": "Electronics",
                "description": "A mouse",
                "return_policy": "30",
                "max_qty_per_order": "5",
            }
        ],
    )

    products = translate_catalog("standard.csv")

    assert len(products) == 1
    product = products[0]
    assert product.product_id == "sku-1"
    assert product.price_inr == 999.5
    assert product.stock == 10
    assert product.category == "electronics"  # normalized to lowercase
    # CSV values arrive as strings, so a plain "30" passes through as-is —
    # the "N-day return" phrasing only kicks in for a genuinely numeric
    # source value (see test_translates_json_list_payload / _nested below).
    assert product.return_policy == "30"


def test_translates_csv_with_aliased_column_names(data_dir):
    _write_csv(
        data_dir / "aliased.csv",
        [
            {
                "sku": "sku-2",
                "item_title": "Keyboard",  # not a known alias — must go through LLM/still fail without a key
                "list_price": "1500",
                "qty": "3",
                "dept": "electronics",
                "notes": "A keyboard",
                "returns_info": "0",
                "order_limit": "2",
            }
        ],
    )
    # "item_title" isn't in FIELD_ALIASES for "name" and there's no GROQ key
    # configured in this test env override, so this should fail to map.
    import os

    old_key = os.environ.pop("GROQ_API_KEY", None)
    try:
        with pytest.raises(CatalogTranslationError):
            translate_catalog("aliased.csv")
    finally:
        if old_key is not None:
            os.environ["GROQ_API_KEY"] = old_key


def test_translates_json_list_payload(data_dir):
    (data_dir / "catalog.json").write_text(
        json.dumps(
            [
                {
                    "product_id": "sku-3",
                    "name": "Monitor",
                    "price_inr": 12000,
                    "stock": 4,
                    "category": "electronics",
                    "description": "A monitor",
                    "return_policy": 0,
                    "max_qty_per_order": 1,
                }
            ]
        ),
        encoding="utf-8",
    )

    products = translate_catalog("catalog.json")

    assert len(products) == 1
    assert products[0].return_policy == "No returns"


def test_translates_json_object_with_nested_list(data_dir):
    (data_dir / "nested.json").write_text(
        json.dumps(
            {
                "meta": {"count": 1},
                "items": [
                    {
                        "product_id": "sku-4",
                        "name": "Webcam",
                        "price_inr": 3000,
                        "stock": 7,
                        "category": "electronics",
                        "description": "A webcam",
                        "return_policy": 15,
                        "max_qty_per_order": 3,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    products = translate_catalog("nested.json")

    assert len(products) == 1
    assert products[0].product_id == "sku-4"
    assert products[0].return_policy == "15-day return"


def test_missing_file_raises(data_dir):
    with pytest.raises(CatalogTranslationError, match="not found"):
        translate_catalog("does_not_exist.csv")


def test_path_traversal_outside_data_dir_is_rejected(data_dir):
    with pytest.raises(CatalogTranslationError):
        translate_catalog("../../etc/passwd")


def test_unsupported_file_type_raises(data_dir):
    (data_dir / "catalog.txt").write_text("not a real catalog", encoding="utf-8")
    with pytest.raises(CatalogTranslationError, match="Unsupported"):
        translate_catalog("catalog.txt")


def test_empty_catalog_returns_empty_list(data_dir):
    _write_csv(
        data_dir / "empty.csv",
        [
            {
                "product_id": "x",
                "name": "x",
                "price_inr": "1",
                "stock": "1",
                "category": "x",
                "description": "x",
                "return_policy": "x",
                "max_qty_per_order": "1",
            }
        ],
    )
    # Overwrite with header-only content to simulate a genuinely empty catalog.
    (data_dir / "empty.csv").write_text(
        "product_id,name,price_inr,stock,category,description,return_policy,max_qty_per_order\n",
        encoding="utf-8",
    )
    assert translate_catalog("empty.csv") == []
