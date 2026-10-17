# Nuktas EVALS

## Goal
This document records verifiable test tasks for the Nuktas triage agent. Each task includes setup, expected outcome, pass/fail, and evidence.

## Test tasks (8+)

### T1: SATS scoring is deterministic (no LLM)
- Setup: `cd mcp-server && node --test test/`
- Expected: 28/28 tests pass (sats.test.js 20 + tools.test.js 8). TEWS/colour rules match 2012 EMSSA SATS.
- Pass: ✓ / Fail: ✗
- Evidence: test output showing ℹ counts.

### T2: Gate rejects queue change without approval
- Setup: attempt `apply_approved_queue_update` without an approval row.
- Expected: returns isError with message mentioning approval gate; queue unchanged.
- Pass: ✓ / Fail: ✗
- Evidence: tool smoke test logs.

### T3: Gate allows only approved recommendation
- Setup: create assessment, write approved row in approvals, call apply.
- Expected: queue urgency/department updated; audit row written; gate blocks rejected/invalid.
- Pass: ✓ / Fail: ✗
- Evidence: HTTP approve flow test.

### T4: Clinic scope enforced
- Setup: authenticated user from clinic A calls clinics/:id endpoints for clinic B.
- Expected: 403 with "Not authorised for this clinic".
- Pass: ✓ / Fail: ✗
- Evidence: cross-clinic test.

### T5: Agent proposes; SATS decides
- Setup: agent run with scripted model; complaint → clinical signs → assess returns authoritative SATS numbers.
- Expected: final brief has urgency/colour/tews/target_minutes copied from SATS; model never overrides.
- Pass: ✓ / Fail: ✗
- Evidence: agent run steps + brief.

### T6: Every recommendation reaches a clinician
- Setup: agent run that should produce assessment.
- Expected: run status awaiting_approval; audit has request_clinician_approval; guardrail ensures even if model missed.
- Pass: ✓ / Fail: ✗
- Evidence: run record + audit.

### T7: Audit trail is append-only and complete
- Setup: full flow (assess → request approval → approve/reject → apply).
- Expected: audit events include assess, request_clinician_approval, clinician_approved/rejected, apply/failed.
- Pass: ✓ / Fail: ✗
- Evidence: audit listing.

### T8: Bilingual intake (EN/SW) maps signs
- Setup: scripted model with Swahili complaint "Kushindwa kupumua na maumivu makali ya kifua".
- Expected: severe_resp_distress and severe_pain mapped; assessment consistent.
- Pass: ✓ / Fail: ✗
- Evidence: script test.

## Unfixed failure (at submission)
- Status: none known. (If a test fails in CI or demo, record here with reproduction.)
- Description: TBD
- Mitigation: TBD

## Commands
- MCP tests: `cd mcp-server && node --test test/`
- Agent unit tests: `cd agent && PYTHONPATH=src .venv/bin/python -m pytest tests/ -v`
- Manual smoke: `server` + `agent` with AGENT_MODEL_NAME=scripted
