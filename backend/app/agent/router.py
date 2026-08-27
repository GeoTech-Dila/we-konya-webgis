import os
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.agent.service import AgentService


router = APIRouter(prefix="/agent", tags=["Agentic GIS"])


class HistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=3000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=2, max_length=2000)
    history: list[HistoryItem] = Field(default_factory=list, max_length=10)


class ChatResponse(BaseModel):
    answer: str
    tools_used: list[str]
    model: str


@router.post("/chat", response_model=ChatResponse)
def agent_chat(payload: ChatRequest, request: Request):
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY yapılandırılmamış.")
    try:
        return AgentService(request.app.state.db_engine).chat(
            payload.message,
            [item.model_dump() for item in payload.history],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Agent yanıt üretemedi: {exc}") from exc
