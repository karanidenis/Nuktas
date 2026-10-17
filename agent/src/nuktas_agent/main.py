"""FastAPI entrypoint for the Nuktas agent worker.

The Node API calls `POST /runs` to ask for a triage run, then watches the run
record this worker streams back. The worker holds no clinical state of its own —
the database and the MCP server do.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
from typing import Any

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from .config import settings
from .runner import RunInput, run_triage

logging.basicConfig(level=logging.INFO, format="%(asctime)s [nuktas-agent] %(message)s")
log = logging.getLogger("nuktas-agent")

app = FastAPI(title="Nuktas agent worker", version="0.1.0")

# Keep strong references so fire-and-forget tasks are not garbage-collected.
_tasks: set[asyncio.Task[Any]] = set()


class RunRequest(BaseModel):
    run_id: str
    clinic_id: str
    patient_id: str
    queue_entry_id: str | None = None
    chief_complaint: str | None = None
    language: str = "en"
    trigger: str = "dashboard"
    preferred_language: str | None = None


class RunAccepted(BaseModel):
    run_id: str
    accepted: bool = True
    model: str = Field(default=settings.model_name)


def _authorize(token: str | None) -> None:
    expected = settings.agent_service_token
    if not expected:
        # Unset token means local dev; refuse only in production.
        return
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service token")


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "nuktas-agent",
        "model": settings.model_name,
        "mode": "scripted" if settings.scripted else "openai-compatible",
        "mcp_command": settings.mcp_command,
    }


@app.post("/runs", response_model=RunAccepted, status_code=status.HTTP_202_ACCEPTED)
async def start_run(
    request: RunRequest,
    x_service_token: str | None = Header(default=None),
) -> RunAccepted:
    _authorize(x_service_token)
    run = RunInput.from_payload(request.model_dump())
    if not run.run_id:
        raise HTTPException(status_code=400, detail="run_id is required")

    task = asyncio.create_task(_execute(run))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    log.info("accepted run %s for patient %s", run.run_id, run.patient_id)
    return RunAccepted(run_id=run.run_id)


@app.post("/runs/sync")
async def run_sync(
    request: RunRequest,
    x_service_token: str | None = Header(default=None),
) -> dict[str, Any]:
    """Synchronous variant — used by the eval harness. Not on the hot path."""
    _authorize(x_service_token)
    run = RunInput.from_payload(request.model_dump())
    return await run_triage(run)


async def _execute(run: RunInput) -> None:
    try:
        await run_triage(run)
    except Exception as exc:  # noqa: BLE001 — run failure is already recorded; keep the worker alive
        log.warning("run %s failed: %s", run.run_id, exc)
