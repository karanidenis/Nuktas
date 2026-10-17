"""A deterministic stand-in for the LLM, used by the governance evals.

This is NOT the product's brain. The product runs an open-weights model served by
any OpenAI-compatible endpoint (bundled Ollama, or a self-hosted vLLM server).
But evals must be reproducible and runnable in CI with no GPU and no
network, so `AGENT_MODEL_NAME=scripted` swaps in this fixed policy. It exercises the
exact same code path — the same tools, the same MCP server, the same hooks — and
only replaces the token generation with a lookup that always makes the correct,
governed choice.

Keeping it honest: it derives clinical signs from the complaint with a small
keyword map (English + Swahili), never invents vitals, always assesses, and
always asks for approval. If the real model misbehaves, the evals that use the
scripted model will still pass — which is the point: they test the harness, and
the real-model evals test the model.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from .toolset import extract_text

__all__ = ["make_scripted_model"]

# Complaint keywords → SATS clinical-sign codes. English and Swahili.
_SIGN_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("not breathing", "cannot breathe", "can't breathe", "no breathing", "kushindwa kupumua", "hapumui"), "severe_resp_distress"),
    (("stopped breathing", "apnoea", "apnea"), "not_breathing"),
    (("seizure", "convuls", "fitting", "degedege", "kifafa"), "current_seizure"),
    (("unconscious", "unresponsive", "haamki", "kupoteza fahamu"), "reduced_consciousness"),
    (("confused", "drowsy", "lethargic", "anachanganyikiwa", "usingizi"), "reduced_consciousness"),
    (("severe pain", "worst pain", "unbearable", "maumivu makali", "maumivu sana"), "severe_pain"),
    (("heavy bleeding", "bleeding a lot", "haemorrhage", "hemorrhage", "damu nyingi"), "uncontrolled_bleeding"),
    (("vomiting", "vomits", "kutapika", "anatapika"), "vomiting_dehydration"),
    (("not drinking", "unable to drink", "refuses to drink", "anakataa kunywa"), "unable_to_drink"),
    (("swallowed poison", "overdose", "poisoning", "amekula sumu"), "poisoning_overdose"),
    (("snake bite", "snakebite", "large joint", "dislocated", "fracture"), "large_joint_dislocation"),
    (("open fracture", "bone out"), "open_fracture"),
    (("minor burn", "small burn"), "minor_burn"),
    (("burn", "burns", "motoni"), "burns_over_10pct"),
    (("abdominal pain", "stomach pain", "maumivu ya tumboni"), "abdominal_pain"),
    (("eye", "jicho"), "eye_injury"),
]


def _signs_from_complaint(complaint: str | None) -> list[str]:
    if not complaint:
        return []
    text = complaint.lower()
    found: list[str] = []
    for keywords, code in _SIGN_KEYWORDS:
        if code in found:
            continue
        if any(k in text for k in keywords):
            found.append(code)
    return found


def _called_tools(messages: list[ModelMessage]) -> set[str]:
    called: set[str] = set()
    for message in messages:
        for part in getattr(message, "parts", []):
            if getattr(part, "part_kind", None) == "tool-return":
                called.add(getattr(part, "tool_name", ""))
    return called


def _last_tool_return(messages: list[ModelMessage], name: str) -> dict[str, Any] | None:
    found: dict[str, Any] | None = None
    for message in messages:
        for part in getattr(message, "parts", []):
            if getattr(part, "part_kind", None) != "tool-return":
                continue
            if getattr(part, "tool_name", "") != name:
                continue
            content = getattr(part, "content", None)
            text = extract_text(content)
            if not text:
                continue
            try:
                parsed = json.loads(text)
            except ValueError:
                continue
            if isinstance(parsed, dict):
                found = parsed
    return found


def make_scripted_model(run: Any) -> FunctionModel:
    """Build a FunctionModel that plays a well-behaved triage agent."""

    def policy(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        called = _called_tools(messages)
        run_id_ok = True  # noqa: F841

        def call(name: str, args: dict[str, Any]) -> ModelResponse:
            return ModelResponse(parts=[ToolCallPart(name, args)])

        if "get_patient_history" not in called and _has_tool(info, "get_patient_history"):
            return call("get_patient_history", {"clinic_id": run.clinic_id, "patient_id": run.patient_id})

        if "get_latest_vitals" not in called and _has_tool(info, "get_latest_vitals"):
            return call("get_latest_vitals", {"clinic_id": run.clinic_id, "patient_id": run.patient_id})

        if "assess_triage_priority" not in called and _has_tool(info, "assess_triage_priority"):
            args: dict[str, Any] = {
                "clinic_id": run.clinic_id,
                "patient_id": run.patient_id,
                "actor": {"type": "agent", "name": "triage-agent"},
                "run_id": run.run_id,
            }
            if run.queue_entry_id:
                args["queue_entry_id"] = run.queue_entry_id
            if run.chief_complaint:
                args["chief_complaint"] = run.chief_complaint
            signs = _signs_from_complaint(run.chief_complaint)
            if signs:
                args["clinical_signs"] = signs
            return call("assess_triage_priority", args)

        assessment = _last_tool_return(messages, "assess_triage_priority") or {}

        if "request_clinician_approval" not in called and _has_tool(info, "request_clinician_approval"):
            if assessment.get("assessment_id"):
                return call(
                    "request_clinician_approval",
                    {
                        "clinic_id": run.clinic_id,
                        "assessment_id": assessment["assessment_id"],
                        "message": "Scripted: please review the SATS recommendation.",
                        "actor": {"type": "agent", "name": "triage-agent"},
                        "run_id": run.run_id,
                    },
                )

        # Emit the structured brief via the output tool pydantic-ai declared.
        output_name = _output_tool_name(info)
        brief = {
            "assessment_id": assessment.get("assessment_id"),
            "urgency": assessment.get("recommended_urgency"),
            "colour": assessment.get("sats_colour"),
            "target_minutes": assessment.get("target_minutes"),
            "tews_score": assessment.get("tews_score"),
            "rationale": assessment.get("rationale") or "No assessment produced.",
            "missing_data": assessment.get("missing_data") or [],
            "needs_more_data": bool(assessment.get("needs_more_data")),
            "nurse_summary": _summary(run),
        }
        if output_name:
            return ModelResponse(parts=[ToolCallPart(output_name, brief)])
        # Fallback: plain text if the agent allows it.
        return ModelResponse(parts=[TextPart(json.dumps(brief))])

    return FunctionModel(policy, model_name="nuktas-scripted")


def _has_tool(info: AgentInfo, name: str) -> bool:
    return any(_tool_name(t) == name for t in info.function_tools)


def _tool_name(tool_def: Any) -> str:
    return getattr(tool_def, "name", "") or ""


def _output_tool_name(info: AgentInfo) -> str | None:
    for tool_def in info.output_tools:
        name = _tool_name(tool_def)
        if name:
            return name
    return None


def _summary(run: Any) -> str:
    if (run.language or "en").lower().startswith("sw"):
        return "Tafadhali subiri; muuguzi anakagua kiwango chako cha dharura."
    return "Please wait here; a nurse is reviewing your urgency level."
