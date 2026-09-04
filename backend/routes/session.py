"""Endpoints that run a full buyer-agent shopping session to completion,
and let a running one be stopped early."""

from fastapi import APIRouter, HTTPException

from agents.buyer_agent import BuyerAgent
from core import kill_switch
from core.catalog_translator import CatalogTranslationError
from models.schemas import SessionResult, SessionStartRequest

router = APIRouter(prefix="/api/session", tags=["session"])


@router.post("/start", response_model=SessionResult)
def start_session(body: SessionStartRequest) -> SessionResult:
    """Run a buyer agent against `body.catalog_file` toward `body.goal`,
    within `body.budget_inr`, and return once it reaches a final answer.

    This call blocks for the full duration of the agent run (all tool calls,
    negotiation rounds, and any checkout it initiates) — use the audit
    trail's SSE stream (`/api/audit/stream`) to watch it live instead of
    polling this endpoint.
    """
    try:
        agent = BuyerAgent(
            goal=body.goal,
            budget_inr=body.budget_inr,
            catalog_file=body.catalog_file,
        )
    except CatalogTranslationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    final_message = agent.run()
    return SessionResult(final_message=final_message)


@router.post("/{session_id}/stop")
def stop_session(session_id: str) -> dict:
    """Ask a running session to halt at its next safe checkpoint — before
    its next tool call, so a checkout already in flight always finishes
    rather than being interrupted partway. A no-op (still returns 200) if
    no session with this id is currently running."""
    kill_switch.request_stop(session_id)
    return {"status": "stop_requested"}
