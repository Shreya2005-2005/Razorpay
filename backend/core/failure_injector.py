"""Demo-only in-memory switch for forcing a product into a failure state
(out of stock, or a declined payment), so the Buyer Agent's recovery logic
can be exercised on demand instead of waiting for a real failure."""

from models.schemas import FailureMode

# In-memory, per-product armed failure conditions, for exercising the Buyer
# Agent's recovery logic without depending on a real card decline or a
# genuinely out-of-stock catalog. Keyed by product_id.
_armed: dict[str, FailureMode] = {}


def arm(product_id: str, mode: FailureMode) -> None:
    """Arm a failure mode for one product; it fires on the next check against it."""
    _armed[product_id] = mode


def disarm(product_id: str) -> None:
    """Clear any armed failure mode for one product."""
    _armed.pop(product_id, None)


def clear() -> None:
    """Clear every armed failure mode."""
    _armed.clear()


def get_armed_mode(product_id: str) -> FailureMode | None:
    """The failure mode currently armed for a product, if any."""
    return _armed.get(product_id)


def list_armed() -> dict[str, FailureMode]:
    """Every product currently armed with a failure mode, keyed by product_id."""
    return dict(_armed)
