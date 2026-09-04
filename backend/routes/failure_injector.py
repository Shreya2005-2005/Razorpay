"""Demo-only endpoints to force a specific product into a failure state
(out of stock, or a declined payment) so the buyer agent's recovery
behavior can be exercised on demand instead of waiting for a real one."""

from fastapi import APIRouter

from core import failure_injector
from models.schemas import FailureInjectionRequest, FailureInjectorStatus, FailureMode

router = APIRouter(prefix="/api/failure-injector", tags=["failure-injector"])


@router.post("/arm", response_model=FailureInjectorStatus)
def arm(body: FailureInjectionRequest) -> FailureInjectorStatus:
    """Arm a failure mode for one product; it fires on the next policy check
    (stock_out) or checkout attempt (payment_decline) against it."""
    failure_injector.arm(body.product_id, body.mode)
    return FailureInjectorStatus(armed=failure_injector.list_armed())


@router.post("/disarm", response_model=FailureInjectorStatus)
def disarm(product_id: str) -> FailureInjectorStatus:
    """Clear any armed failure mode for one product."""
    failure_injector.disarm(product_id)
    return FailureInjectorStatus(armed=failure_injector.list_armed())


@router.get("/armed")
def armed() -> dict[str, FailureMode]:
    """List every product currently armed with a failure mode."""
    return failure_injector.list_armed()
