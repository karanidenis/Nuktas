"""Manual smoke run of the agent worker (scripted model) against a live stack.

Usage:
    NUKTAS_REPO_ROOT=/path/to/Nuktas \
    AGENT_API_BASE_URL=http://localhost:4000 \
    AGENT_MODEL_NAME=scripted \
    agent/.venv/bin/python agent/tests/smoke_run.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

REPO = Path(os.environ.get("NUKTAS_REPO_ROOT", Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(REPO / "agent" / "src"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO / ".env")
os.environ.setdefault("NUKTAS_REPO_ROOT", str(REPO))

import httpx  # noqa: E402

from nuktas_agent.config import settings  # noqa: E402
from nuktas_agent.runner import RunInput, run_triage  # noqa: E402

CLINIC = os.environ["CLINIC_ID"]
PATIENT = os.environ["PATIENT_ID"]
ENTRY = os.environ.get("QUEUE_ENTRY_ID")
COMPLAINT = os.environ.get("CHIEF_COMPLAINT", "Severe chest pain and difficulty breathing")
LANGUAGE = os.environ.get("LANGUAGE", "sw")


async def create_run() -> str:
    headers = {"X-Service-Token": settings.agent_service_token, "Content-Type": "application/json"}
    payload = {
        "clinic_id": CLINIC,
        "patient_id": PATIENT,
        "queue_entry_id": ENTRY,
        "trigger": "smoke",
        "language": LANGUAGE,
        "input": {"chief_complaint": COMPLAINT},
    }
    async with httpx.AsyncClient(timeout=15) as c:
        res = await c.post(f"{settings.api_base_url}/api/v1/agent-runs", json=payload, headers=headers)
        res.raise_for_status()
        return res.json()["run"]["id"]


async def main() -> None:
    run_id = await create_run()
    print(f"run: {run_id}")
    brief = await run_triage(
        RunInput(
            run_id=run_id,
            clinic_id=CLINIC,
            patient_id=PATIENT,
            queue_entry_id=ENTRY,
            chief_complaint=COMPLAINT,
            language=LANGUAGE,
            trigger="smoke",
        )
    )
    print(json.dumps(brief, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
