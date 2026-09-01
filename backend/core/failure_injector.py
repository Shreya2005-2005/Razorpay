from models.schemas import FailureMode

# In-memory, per-product armed failure conditions, for exercising the Buyer
# Agent's recovery logic without depending on a real card decline or a
# genuinely out-of-stock catalog. Keyed by product_id.
_armed: dict[str, FailureMode] = {}


def arm(product_id: str, mode: FailureMode) -> None:
    _armed[product_id] = mode


def disarm(product_id: str) -> None:
    _armed.pop(product_id, None)


def clear() -> None:
    _armed.clear()


def get_armed_mode(product_id: str) -> FailureMode | None:
    return _armed.get(product_id)


def list_armed() -> dict[str, FailureMode]:
    return dict(_armed)
