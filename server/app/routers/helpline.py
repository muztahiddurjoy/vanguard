"""The AI query helpline over HTTP (web chat, UDC kiosks), tracking by token, and
mediation notices by their number.

The same agent answers the phone line (see ``services.stream_manager``). A
tracking number reveals only a case's stage (``services.case_status``); a notice
number only what its SMS said (``services.mediation``).
"""

import re
import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.helpline import helpline
from app.database import get_db
from app.routers import require_api_token
from app.services.case_status import lookup_number, lookup_token
from app.services.mediation import lookup_notice

router = APIRouter(prefix="/helpline", tags=["helpline"], dependencies=[Depends(require_api_token)])


class StartIn(BaseModel):
    language: Literal["bn", "en"] = "bn"


class TurnIn(BaseModel):
    utterance: str = Field(min_length=1, max_length=2000)


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
def start_conversation(body: StartIn) -> dict[str, Any]:
    session_id = uuid.uuid4().hex
    state = helpline().start(session_id, language=body.language)
    return {"sessionId": session_id, "reply": state["reply"]}


@router.post("/conversations/{session_id}/turns")
def conversation_turn(
    session_id: str, body: TurnIn, db: Session = Depends(get_db)
) -> dict[str, Any]:
    conv = helpline()
    current = conv.state(session_id)
    if not current:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown conversation")
    if current.get("complete"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Conversation already finished")
    state = conv.turn(session_id, body.utterance, lookup=lambda number: lookup_number(db, number))
    return {
        "reply": state["reply"],
        "intent": state.get("intent"),
        "complete": state.get("complete", False),
    }


@router.get("/track/{token}")
def track(token: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    found = lookup_token(db, re.sub(r"\D", "", token))
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No case with that tracking number")
    return found


@router.get("/notice/{code}")
def notice(code: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    found = lookup_notice(db, re.sub(r"\D", "", code))
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No notice with that number")
    return found
