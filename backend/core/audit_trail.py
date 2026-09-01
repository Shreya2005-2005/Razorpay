import asyncio
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Iterator

from models.schemas import AuditActor, AuditEvent, AuditEventType

# Ambient session id for whichever agent run is currently executing on this
# thread/task. Set for the duration of a BuyerAgent run (see session_scope
# below) so every audit_trail.emit() call underneath it — however deeply
# nested across negotiation/checkout/policy_guard — is tagged automatically,
# with no need to thread a session_id through each of those call signatures.
_current_session_id: ContextVar[str] = ContextVar("current_session_id", default="")


@contextmanager
def session_scope(session_id: str) -> Iterator[None]:
    token = _current_session_id.set(session_id)
    try:
        yield
    finally:
        _current_session_id.reset(token)


def current_session_id() -> str:
    return _current_session_id.get()


class AuditTrail:
    """In-memory, append-only log of everything agents/guardrails/Razorpay do,
    fanned out live to any number of SSE subscribers."""

    def __init__(self) -> None:
        self._history: list[AuditEvent] = []
        self._subscribers: set[asyncio.Queue[AuditEvent]] = set()

    def emit(
        self,
        actor: AuditActor,
        event_type: AuditEventType,
        message: str,
        metadata: dict | None = None,
        session_id: str | None = None,
    ) -> AuditEvent:
        event = AuditEvent(
            timestamp=datetime.now(timezone.utc).isoformat(),
            actor=actor,
            event_type=event_type,
            message=message,
            metadata=metadata or {},
            session_id=session_id if session_id is not None else _current_session_id.get(),
        )
        self._history.append(event)
        for queue in self._subscribers:
            queue.put_nowait(event)
        return event

    def history(self) -> list[AuditEvent]:
        return list(self._history)

    def subscribe(self) -> asyncio.Queue[AuditEvent]:
        queue: asyncio.Queue[AuditEvent] = asyncio.Queue()
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[AuditEvent]) -> None:
        self._subscribers.discard(queue)


audit_trail = AuditTrail()
