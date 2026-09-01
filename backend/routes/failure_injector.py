from fastapi import APIRouter

from core import failure_injector
from models.schemas import FailureInjectionRequest, FailureMode

router = APIRouter(prefix="/api/failure-injector", tags=["failure-injector"])


@router.post("/arm")
def arm(body: FailureInjectionRequest):
    failure_injector.arm(body.product_id, body.mode)
    return {"armed": failure_injector.list_armed()}


@router.post("/disarm")
def disarm(product_id: str):
    failure_injector.disarm(product_id)
    return {"armed": failure_injector.list_armed()}


@router.get("/armed")
def armed() -> dict[str, FailureMode]:
    return failure_injector.list_armed()
