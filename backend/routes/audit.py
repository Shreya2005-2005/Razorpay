"""Read and stream the business audit trail (see core.audit_trail) — the
record of every decision, guardrail check, negotiation turn, and payment
call an agent run produces."""

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from core.audit_trail import audit_trail
from models.schemas import AuditEvent, AuditEventRequest

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/events", response_model=list[AuditEvent])
def get_events() -> list[AuditEvent]:
    """Return the full audit trail accumulated so far, oldest first."""
    return audit_trail.history()


@router.post("/events", response_model=AuditEvent)
def emit_event(body: AuditEventRequest) -> AuditEvent:
    """Manually emit a test event — useful for exercising the trail before agents wire into it."""
    return audit_trail.emit(
        actor=body.actor,
        event_type=body.event_type,
        message=body.message,
        metadata=body.metadata,
        session_id=body.session_id,
    )


@router.get("/stream")
async def stream_events(request: Request) -> EventSourceResponse:
    """Server-sent events stream: the full history as a backlog, then every
    new event live, until the client disconnects."""
    # Subscribe before snapshotting history so no event emitted in between is lost or duplicated.
    queue = audit_trail.subscribe()
    history_snapshot = audit_trail.history()

    async def event_generator():
        try:
            for event in history_snapshot:
                yield {"event": "audit", "data": event.model_dump_json()}
            while True:
                if await request.is_disconnected():
                    break
                event = await queue.get()
                yield {"event": "audit", "data": event.model_dump_json()}
        finally:
            audit_trail.unsubscribe(queue)

    return EventSourceResponse(event_generator())
