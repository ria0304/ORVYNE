import logging
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth_utils import UserProfile, get_current_user
from ai_model import FashionAIModel
from database import get_db
from routers.ai_router import compute_gap_analysis

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/luna", tags=["Luna AI Orchestrator"])


class LunaChatRequest(BaseModel):
    message: str
    intent: str


class LunaChatResponse(BaseModel):
    text: str
    outfits: Optional[List[Any]] = None
    gapAnalysis: Optional[dict] = None


def _wardrobe_items(user_id: str) -> List[dict]:
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM wardrobe_items WHERE user_id = ?", (user_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.post("/chat", response_model=LunaChatResponse)
async def handle_luna_chat(payload: LunaChatRequest, current_user: UserProfile = Depends(get_current_user)):
    """Luna chat turn for the signed-in user.

    Failures are real HTTP errors (never a friendly 200), so callers such as the
    ORVYNE gateway can tell a real answer from a failure.
    """
    intent = payload.intent.lower().strip()
    user_id = current_user.user_id

    if intent == "outfit-help":
        items = _wardrobe_items(user_id)
        if not items:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Your wardrobe is empty: add items before asking for outfits")
        try:
            outfits = await FashionAIModel.generate_outfits_from_wardrobe(items)
        except Exception as e:
            logger.error("Luna outfit-help failed user=%s: %s", user_id[:8], e)
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Outfit generation failed")
        if not outfits:
            # The outfit model returns [] when it is unavailable or finds no combination.
            return LunaChatResponse(text=f"I could not put together an outfit from your {len(items)} items yet.", outfits=[])
        return LunaChatResponse(text=f"Here are {len(outfits)} outfit ideas from your {len(items)} wardrobe items.", outfits=outfits)

    if intent == "gap-analysis":
        try:
            gaps = await compute_gap_analysis(current_user, {})
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Luna gap-analysis failed user=%s: %s", user_id[:8], e)
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Gap analysis failed")
        return LunaChatResponse(
            text=f"I found {len(gaps.get('gaps', []))} gaps across {gaps.get('wardrobeCount', 0)} items.",
            gapAnalysis=gaps,
        )

    raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsupported intent '{intent}'. Supported: outfit-help, gap-analysis")
