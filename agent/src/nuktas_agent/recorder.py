"""Run log recorder — every agent action streamed back to the Node API.

The challenge requires "logged tool call for every action". This module is the
shipper: the agent wraps each MCP tool call and pushes a step row into the
`agent_runs.steps` JSON array via the API's service-token endpoint, so the
dashboard shows the run live and the audit trail has a full account of what the
model chose to do (and what each tool answered).

Failures to log never abort the clinical task — a dropped telemetry write must
not strand a patient — but every failure is counted so it can be inspected.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from .config import settings

__all__ = ["RunRecorder", "StepSummary"]


class StepSummary:
    """Small helper that times and serialises one tool call into a step row."""

    def __init__(self, name: str, args: dict[str, Any]):
        self.name = name
        self.args = args
        self.started = time.monotonic()
        self.ok = True
        self.result: Any = None
        self.error: str | None = None

    @property
    def latency_ms(self) -> int:
        return int((time.monotonic() - self.started) * 1000)

    def to_step(self) -> dict[str, Any]:
        step: dict[str, Any] = {
            "kind": "tool_call",
            "name": self.name,
            "args": _redact(self.args),
            "ok": self.ok,
            "latency_ms": self.latency_ms,
            "ts": time.time(),
        }
        if self.error:
            step["error"] = self.error
        summary = summarise_result(self.result)
        if summary is not None:
            step["result"] = summary
        return step


def _redact(value: Any) -> Any:
    """Strip anything that looks like a credential from logged arguments."""
    if isinstance(value, dict):
        return {
            k: "***" if any(s in k.lower() for s in ("password", "token", "secret")) else _redact(v)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


def summarise_result(result: Any, limit: int = 4000) -> Any:
    """Keep a bounded, JSON-safe view of a tool result for the run log."""
    if result is None:
        return None
    if isinstance(result, (str, int, float, bool)):
        return result[:limit] if isinstance(result, str) else result
    try:
        import json

        text = json.dumps(result, default=str)
        if len(text) > limit:
            return {"truncated": True, "preview": text[:limit]}
        return json.loads(text)
    except Exception:
        return str(result)[:limit]


class RunRecorder:
    """Send run-step and lifecycle updates to the Node API."""

    def __init__(self, run_id: str, *, client: httpx.AsyncClient | None = None):
        self.run_id = run_id
        self._client = client
        self._owns_client = client is None
        self.failures = 0

    async def __aenter__(self) -> "RunRecorder":
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=settings.callback_timeout_s)
        return self

    async def __aexit__(self, *exc: Any) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()

    async def _patch(self, payload: dict[str, Any]) -> None:
        if not self._client:
            return
        url = f"{settings.api_base_url}/api/v1/agent-runs/{self.run_id}"
        headers = {"X-Service-Token": settings.agent_service_token}
        try:
            res = await self._client.patch(url, json=payload, headers=headers)
            if res.status_code >= 400:
                self.failures += 1
        except Exception:
            self.failures += 1

    async def log_step(self, step: dict[str, Any]) -> None:
        await self._patch({"step": step})

    async def log_tool(self, summary: StepSummary) -> None:
        await self.log_step(summary.to_step())

    async def update(
        self,
        *,
        status: str | None = None,
        summary: str | None = None,
        assessment_id: str | None = None,
        error: str | None = None,
        model: str | None = None,
        provider: str | None = None,
        tokens_in: int | None = None,
        tokens_out: int | None = None,
        duration_ms: int | None = None,
        finished: bool = False,
    ) -> None:
        payload: dict[str, Any] = {}
        for key, value in {
            "status": status,
            "summary": summary,
            "assessment_id": assessment_id,
            "error": error,
            "model": model,
            "provider": provider,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "duration_ms": duration_ms,
        }.items():
            if value is not None:
                payload[key] = value
        if finished:
            payload["finished"] = True
        if payload:
            await self._patch(payload)
