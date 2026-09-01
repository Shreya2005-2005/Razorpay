from fastapi import APIRouter, HTTPException

from core.catalog_translator import CatalogTranslationError, translate_catalog
from core.policy_guard import check_order, load_policy
from models.schemas import OrderCheckRequest, PolicyConfig, PolicyResult

router = APIRouter(prefix="/api/policy", tags=["policy"])


@router.get("", response_model=PolicyConfig)
def get_policy():
    return load_policy()


@router.post("/check-order", response_model=PolicyResult)
def check_order_route(body: OrderCheckRequest):
    try:
        catalog = translate_catalog(body.catalog_file)
    except CatalogTranslationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    product = next((p for p in catalog if p.product_id == body.product_id), None)
    if product is None:
        raise HTTPException(
            status_code=404,
            detail=f"Product '{body.product_id}' not found in {body.catalog_file}",
        )

    return check_order(
        product=product,
        quantity=body.quantity,
        orders_this_session=body.orders_this_session,
    )
