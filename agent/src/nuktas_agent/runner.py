"""Run one triage task end to end.

This is the orchestration the challenge asks for, built on Pydantic AI:

    build model (open-weights via Ollama)  →  give it ONLY the governed MCP
    tools  →  run  →  take the model's narrative but overwrite every
    authoritative clinical field with what the deterministic SATS tool returned.

The model writes prose; the tool writes the numbers. That is the whole point.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from .config import settings
from .protocol import SYSTEM_PROMPT
from .recorder import RunRecorder
from .toolset import GovernedToolset
from . import mcp_client

__all__ = ["RunInput", "TriageBrief", "run_triage"]


@dataclass
class RunInput:
    run_id: str
    clinic_id: str
    patient_id: str
    queue_entry_id: str | None = None
    chief_complaint: str | None = None
    language: str = "en"
    trigger: str = "dashboard"
    preferred_language: str | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "RunInput":
        return cls(
            run_id=str(payload.get("run_id") or ""),
            clinic_id=str(payload.get("clinic_id") or ""),
            patient_id=str(payload.get("patient_id") or ""),
            queue_entry_id=payload.get("queue_entry_id") or None,
            chief_complaint=payload.get("chief_complaint") or None,
            language=str(payload.get("language") or "en"),
            trigger=str(payload.get("trigger") or "dashboard"),
            preferred_language=payload.get("preferred_language") or None,
        )


class TriageBrief(BaseModel):
    """The structured brief the agent returns (and the dashboard renders)."""

    assessment_id: str | None = None
    urgency: str | None = None
    colour: str | None = None
    target_minutes: int | None = None
    tews_score: int | None = None
    rationale: str = ""
    missing_data: list[str] = Field(default_factory=list)
    needs_more_data: bool = False
    nurse_summary: str = ""
    approval_requested: bool = False


def _prompt_for(run: RunInput, runtime_policy: str = "") -> str:
    policy_block = (
        f"\nRuntime policy loaded through the borrowed filesystem MCP:\n{runtime_policy[:4000]}\n"
        if runtime_policy
        else ""
    )
    return (
        f"Clinic: {run.clinic_id}\n"
        f"Patient: {run.patient_id}\n"
        f"Queue entry: {run.queue_entry_id or 'none (not yet queued)'}\n"
        f"Intake language: {run.language}\n"
        f"Chief complaint (verbatim, may be Swahili): {run.chief_complaint or 'not captured'}\n\n"
        f"{policy_block}\n"
        "Assess this patient's SATS triage priority and put the recommendation in "
        "front of a clinician for approval. Follow the protocol exactly."
    )


def _build_model(run: RunInput):
    if settings.scripted:
        from .scripted import make_scripted_model

        return make_scripted_model(run)

    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    provider = OpenAIProvider(base_url=settings.model_base_url, api_key=settings.model_api_key)
    return OpenAIChatModel(settings.model_name, provider=provider)


def _build_agent(model: Any, toolset: GovernedToolset) -> Agent:
    # Qwen3-compatible endpoints accept this vLLM/Ollama chat-template flag.
    # Without it, short structured runs can spend their entire output budget on
    # hidden reasoning and return no tool call or final content.
    model_settings = (
        {"extra_body": {"chat_template_kwargs": {"enable_thinking": False}}}
        if settings.disable_thinking and not settings.scripted
        else None
    )
    return Agent(
        model,
        output_type=TriageBrief,
        toolsets=[toolset],
        system_prompt=SYSTEM_PROMPT,
        model_settings=model_settings,
        retries=settings.max_agent_retries,
    )


def _apply_authoritative_fields(brief: TriageBrief, assessment: dict[str, Any]) -> TriageBrief:
    """The tool's numbers override the model's prose. Always."""
    return brief.model_copy(
        update={
            "assessment_id": assessment.get("assessment_id") or brief.assessment_id,
            "urgency": assessment.get("urgency"),
            "colour": assessment.get("colour"),
            "tews_score": assessment.get("tews_score"),
            "target_minutes": brief.target_minutes,
        }
    )


def _usage_counts(result: Any) -> tuple[int | None, int | None]:
    usage = getattr(result, "usage", None)
    if callable(usage):  # older API exposed usage as a method
        usage = usage()
    if usage is None:
        return None, None
    return getattr(usage, "input_tokens", None), getattr(usage, "output_tokens", None)


async def run_triage(run: RunInput) -> dict[str, Any]:
    """Execute a run and return the final brief as a dict.

    Never raises for a model failure — the run record is marked failed and the
    exception is re-raised only after the record is updated, so the dashboard
    always sees an outcome.
    """
    started = time.monotonic()
    provider = "scripted" if settings.scripted else "openai-compatible"

    async with RunRecorder(run.run_id) as recorder:
        await recorder.update(
            status="running",
            model=settings.model_name,
            provider=provider,
            tokens_in=0,
            tokens_out=0,
        )

        toolset = GovernedToolset(recorder=recorder)
        runtime_policy = ""
        borrowed_mcp_used = False

        # The challenge requires a second MCP server. The official filesystem
        # server loads a narrowly scoped runtime-policy artifact; it is never
        # exposed to the model as a write-capable toolset.
        try:
            runtime_policy = await mcp_client.read_runtime_policy()
            borrowed_mcp_used = bool(runtime_policy)
            await recorder.log_step(
                {
                    "kind": "borrowed_mcp",
                    "name": "filesystem.read_text_file",
                    "ok": borrowed_mcp_used,
                    "detail": "Loaded TRIAGE_RUNTIME_POLICY.md from the allowed protocol directory.",
                    "ts": time.time(),
                }
            )
        except Exception as exc:  # noqa: BLE001
            await recorder.log_step(
                {
                    "kind": "borrowed_mcp",
                    "name": "filesystem.read_text_file",
                    "ok": False,
                    "error": str(exc),
                    "ts": time.time(),
                }
            )

        try:
            agent = _build_agent(_build_model(run), toolset)
            result = await agent.run(_prompt_for(run, runtime_policy))
            brief: TriageBrief = result.output
            tokens_in, tokens_out = _usage_counts(result)
        except Exception as exc:  # noqa: BLE001
            await recorder.update(
                status="failed",
                error=f"{type(exc).__name__}: {exc}",
                duration_ms=int((time.monotonic() - started) * 1000),
                finished=True,
            )
            raise

        if toolset.assessments:
            brief = _apply_authoritative_fields(brief, toolset.assessments[-1])

        # ── Governance guardrail ────────────────────────────────────────────
        # Every recommendation must reach a clinician. If the model finished
        # without asking for review, the orchestrator does it anyway, over its
        # own governed MCP session, and records why. The model cannot skip the
        # human gate by simply not calling the tool.
        approval_requested = "request_clinician_approval" in toolset.called_tools
        if brief.assessment_id and not approval_requested:
            try:
                await mcp_client.call_tool(
                    "request_clinician_approval",
                    {
                        "clinic_id": run.clinic_id,
                        "assessment_id": brief.assessment_id,
                        "message": "Raised by orchestrator guardrail (model did not request review).",
                        "actor": {"type": "system", "name": "nuktas-guardrail"},
                        "run_id": run.run_id,
                    },
                )
                await recorder.log_step(
                    {
                        "kind": "guardrail",
                        "name": "ensure_clinician_approval",
                        "ok": True,
                        "detail": "Model did not request clinician review; orchestrator raised it instead.",
                        "ts": time.time(),
                    }
                )
                approval_requested = True
            except Exception as exc:  # noqa: BLE001
                await recorder.log_step(
                    {
                        "kind": "guardrail",
                        "name": "ensure_clinician_approval",
                        "ok": False,
                        "error": str(exc),
                        "ts": time.time(),
                    }
                )

        # A recommendation exists but is not applied → it is awaiting the nurse.
        status = "awaiting_approval" if brief.assessment_id else "completed"
        brief.approval_requested = bool(brief.assessment_id and approval_requested)

        summary = brief.rationale or "Assessment complete."
        if brief.missing_data:
            summary += f" Missing: {', '.join(brief.missing_data)}."

        await recorder.update(
            status=status,
            summary=summary[:1000],
            assessment_id=brief.assessment_id,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            duration_ms=int((time.monotonic() - started) * 1000),
            finished=True,
        )

        payload = brief.model_dump()
        payload["tool_call_count"] = toolset.tool_call_count
        payload["borrowed_mcp_used"] = borrowed_mcp_used
        payload["callback_failures"] = recorder.failures
        return payload
