# Nuktas — ARCHITECTURE

## Overview
Nuktas is the "Triage Desk" agent: intake → SATS prioritisation → clinician approval → governed queue change. Design: deterministic scoring (no LLM for priority), MCP as the sole DB boundary for governed writes, approval gate (named clinician), audit trail, bilingual intake, realtime updates.

## Components
1. **mcp-server** (Node + MCP SDK, stdio) — tools enforce clinic scope; only `apply_approved_queue_update` touches queue and requires a matching `approvals` row. Deterministic SATS from EMSSA 2012 tables.
2. **server** (Express + Socket.IO + PostgreSQL) — REST API with JWT, service-token endpoints for the agent, LISTEN/NOTIFY→Socket.IO bridge, and an MCP client that spawns the mcp-server to call `apply_approved_queue_update`.
3. **agent** (Python + FastAPI + Pydantic AI) — agent worker; orchestrates calls via MCP, logs every tool call back to the API, ensures clinician approval, uses Ollama (open-weights). Scripted model for evals.
4. **client** (React + Vite + Chakra UI) — dashboard with queue, triage review board, audit/agent run panels, bilingual-aware UI.

## Data & governance
- Tables: vitals, triage_assessments, approvals (gate), agent_runs, audit_events (append-only). Clinics organised; patients have age/height for variant selection.
- `evaluateGate(assessment, approval)` decides: assessment exists, linked to queue entry, not already applied, approval exists and decision=approved.
- Priority never guessed by LLM. Clinical signs proposed by model; scoring/catalogue is deterministic in SATS module.

## MCP tools (8)
get_waiting_queue, get_latest_vitals, get_patient_history, record_vitals, assess_triage_priority, flag_deterioration_for_review, request_clinician_approval, apply_approved_queue_update.

## Realtime
Postgres `LISTEN/NOTIFY` on channel `nuktas_events`; server bridge forwards to Socket.IO rooms `clinic:{id}`.

## Borrowed MCP
@modelcontextprotocol/server-filesystem — for reading source files/artifacts in dev and verification. Rationale: standard, auditable, not authored by Nuktas; narrows file access.

## One-command / quick start
`docker compose up --build` (services: postgres, server, client, asr, tts, ollama). Agent runs as a service (AGENT_BASE_URL/AGENT_SERVICE_TOKEN). Model served by the bundled Ollama container — or point `AGENT_MODEL_BASE_URL` at any OpenAI-compatible server (self-hosted vLLM/TGI/LM Studio).
