from fastapi import APIRouter, HTTPException

from core.catalog_translator import CatalogTranslationError, translate_catalog
from models.schemas import Product

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/{catalog_file}", response_model=list[Product])
def get_catalog(catalog_file: str):
    """Translate a merchant catalog file into the standard Product schema."""
    try:
        return translate_catalog(catalog_file)
    except CatalogTranslationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
