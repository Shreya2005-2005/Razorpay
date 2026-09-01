from fastapi import APIRouter, HTTPException

from agents.buyer_agent import BuyerAgent
from core.catalog_translator import CatalogTranslationError
from models.schemas import SessionResult, SessionStartRequest

router = APIRouter(prefix="/api/session", tags=["session"])


@router.post("/start", response_model=SessionResult)
def start_session(body: SessionStartRequest):
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
