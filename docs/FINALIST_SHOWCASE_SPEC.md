# Finalist showcase specification

## Problem

Judges can inspect Nuktas's individual tools, but the product needs one concise,
repeatable story showing clinic pressure, agent recovery, deterioration review,
human approval, interoperability, and audit evidence without using real data.

## P0 scope

1. An authenticated, synthetic-only “busy morning” scenario creates a queued
   patient, demonstrates rejection of an implausible vital sign, records a
   corrected observation, and starts the governed agent.
2. The activity workspace shows recheck deadlines and before/after observations.
3. Agent runs expand into a readable tool timeline with failures, latency,
   inputs, outputs, model usage, and terminal state.
4. Clinician approval/rejection captures the clinician's selected urgency and a
   structured reason so agreement and under/over-triage can be measured.
5. Approved or rejected assessments export as a deterministic handoff document
   and a minimal FHIR R4 Bundle.
6. A metrics summary reports agreement, under/over-triage, decision latency,
   run latency, and configured model-cost estimates while labelling synthetic data.

## Non-goals

- No diagnosis, treatment plan, or autonomous priority change.
- No full FHIR server, facility EHR write-back, or production tenant provisioning.
- No real patient records in the scenario or public judge environment.
- No creative LLM-authored clinical document; exports are deterministic records.
- No claim of clinical effectiveness without facility validation.

## Acceptance criteria

- The scenario is started by a named authenticated user and every action is audited.
- An implausible measurement is rejected by the real MCP tool before correction.
- The agent ends at clinician review and cannot update the queue itself.
- Deterioration rows show a recheck state and observation delta.
- A decision records clinician urgency and reason; metrics update afterward.
- Handoff HTML/JSON and FHIR exports include provenance and the clinician gate.
