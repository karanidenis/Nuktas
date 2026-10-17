"""The governed MCP toolset the agent is allowed to hold.

Two jobs:

1. **Deny the irreversible tool.** `apply_approved_queue_update` is the only way
   to move a patient in the queue. It is stripped from the tool list the model
   sees, so the agent *cannot* touch the queue even if it tried. The nurse's
   approval in the API is what reaches that tool — the model never holds it.

2. **Log every call.** The `process_tool_call` hook wraps each MCP call, times
   it, captures the result, and ships a step row to the run log. That is the
   "logged tool call for every action" requirement, implemented as a hook rather
   than as prompt text, so no model behaviour can skip it.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic_ai.mcp import MCPToolset, StdioTransport

from .config import settings
from .recorder import RunRecorder, StepSummary

__all__ = ["AGENT_DENIED_TOOLS", "GovernedToolset", "extract_text"]

# Deliberately unavailable to the model. Defence in depth: the MCP server also
# refuses this tool without a matching approval row.
AGENT_DENIED_TOOLS = frozenset({"apply_approved_queue_update"})

# Tools that return an assessment id — used to link the run to its artifact.
_ASSESSING_TOOLS = frozenset({"assess_triage_priority", "flag_deterioration_for_review"})


def extract_text(result: Any) -> str:
    """Best-effort conversion of an MCP tool result into its text payload."""
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        if result.get("type") == "text":
            return str(result.get("text", ""))
        for key in ("content", "items"):
            if key in result:
                return extract_text(result[key])
        return json.dumps(result, default=str)
    if isinstance(result, (list, tuple)):
        return "\n".join(extract_text(item) for item in result)
    return str(result)


class GovernedToolset(MCPToolset):
    """An `MCPToolset` that cannot write the queue and never goes unlogged."""

    def __init__(
        self,
        *,
        recorder: RunRecorder | None = None,
        transport: StdioTransport | None = None,
        **kwargs: Any,
    ):
        self._recorder = recorder
        self.assessments: list[dict[str, Any]] = []
        self.tool_call_count = 0
        self.called_tools: set[str] = set()

        self._transport = transport or StdioTransport(
            settings.mcp_command,
            list(settings.mcp_args),
            env=settings.mcp_env,
            cwd=settings.mcp_cwd,
        )
        super().__init__(self._transport, process_tool_call=self._process, **kwargs)

    # ── Governance: strip denied tools from the model's view ──────────────────
    async def get_tools(self, ctx: Any) -> dict[str, Any]:
        tools = await super().get_tools(ctx)
        for name in AGENT_DENIED_TOOLS:
            tools.pop(name, None)
        return tools

    # ── Observability: wrap every call ────────────────────────────────────────
    async def _process(
        self,
        ctx: Any,
        call_tool_func: Any,
        name: str,
        tool_args: dict[str, Any],
    ) -> Any:
        summary = StepSummary(name, tool_args or {})
        self.tool_call_count += 1
        self.called_tools.add(name)
        try:
            result = await call_tool_func(name, tool_args)
        except Exception as exc:  # noqa: BLE001 — tool errors are recorded, then re-raised
            summary.ok = False
            summary.error = str(exc)
            await self._ship(summary)
            raise

        summary.result = result
        if name in _ASSESSING_TOOLS:
            self._capture_assessment(result)
        await self._ship(summary)
        return result

    async def _ship(self, summary: StepSummary) -> None:
        if self._recorder is not None:
            try:
                await self._recorder.log_tool(summary)
            except Exception:  # telemetry must never break the clinical task
                pass

    def _capture_assessment(self, result: Any) -> None:
        """Remember the assessment id so the run can reference its artifact."""
        try:
            payload = json.loads(extract_text(result))
        except (ValueError, TypeError):
            return
        if isinstance(payload, dict) and payload.get("assessment_id"):
            self.assessments.append(
                {
                    "assessment_id": payload["assessment_id"],
                    "urgency": payload.get("recommended_urgency"),
                    "colour": payload.get("sats_colour"),
                    "tews_score": payload.get("tews_score"),
                    "status": payload.get("status"),
                }
            )
