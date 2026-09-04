"""Lets a running Buyer Agent session be stopped mid-execution from a
separate request. `agents.buyer_agent.BuyerAgent._run` polls
`is_stop_requested` between tool-calling turns and before dispatching each
individual tool call, so a stop can never land in the middle of a checkout
— the loop only ever stops right before it would take its *next* action,
never mid-action.

In-memory, per-process, keyed by session_id — same pattern as
core.failure_injector. No persistence layer yet (see the Phase 2 roadmap).
"""

_stop_requested: set[str] = set()


def request_stop(session_id: str) -> None:
    """Ask the session to halt at its next safe checkpoint."""
    _stop_requested.add(session_id)


def is_stop_requested(session_id: str) -> bool:
    return session_id in _stop_requested


def clear(session_id: str) -> None:
    """Forget this session's stop flag — called once a run ends, however it
    ends, so the set doesn't grow unboundedly across sessions."""
    _stop_requested.discard(session_id)
