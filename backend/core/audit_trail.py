"""The business audit trail: an append-only, in-memory log of every
decision, guardrail check, negotiation turn, and payment call an agent run
produces, fanned out live to SSE subscribers."""

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from models.schemas import AuditActor, AuditEvent, AuditEventType

# Ambient session id for whichever agent run is currently executing on this
# thread/task. Set for the duration of a BuyerAgent run (see session_scope
# below) so every audit_trail.emit() call underneath it — however deeply
# nested across negotiation/checkout/policy_guard — is tagged automatically,
# with no need to thread a session_id through each of those call signatures.
_current_session_id: ContextVar[str] = ContextVar("current_session_id", default="")


@contextmanager
def session_scope(session_id: str) -> Iterator[None]:
    """Tag every audit_trail.emit() call made within this block with `session_id`."""
    token = _current_session_id.set(session_id)
    try:
        yield
    finally:
        _current_session_id.reset(token)


def current_session_id() -> str:
    """The session id of the agent run currently executing on this task, if any."""
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
        metadata: dict[str, Any] | None = None,
        session_id: str | None = None,
    ) -> AuditEvent:
        """Record one event and push it to every live SSE subscriber."""
        event = AuditEvent(
            timestamp=datetime.now(UTC).isoformat(),
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
        """Every event recorded so far, oldest first."""
        return list(self._history)

    def subscribe(self) -> asyncio.Queue[AuditEvent]:
        """Register a new live subscriber queue; pair with unsubscribe() when done."""
        queue: asyncio.Queue[AuditEvent] = asyncio.Queue()
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[AuditEvent]) -> None:
        """Stop delivering new events to a subscriber queue."""
        self._subscribers.discard(queue)


audit_trail = AuditTrail()
