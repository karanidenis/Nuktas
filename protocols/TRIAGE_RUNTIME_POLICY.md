# Nuktas triage runtime policy

This file is an operational policy input loaded through a read-only, root-confined
MCP server. It is not a substitute for the South African Triage Scale or clinical
judgement.

- Preserve the patient's original complaint and language in the clinical brief.
- Fetch available vitals and history before recommending a priority.
- If observations are missing, list them explicitly; never invent a measurement.
- Priority colour, TEWS score and urgency come only from the governed Nuktas MCP
  SATS tool. The language model may explain the result but may not override it.
- Every recommendation must be reviewed by a named clinician.
- The agent may request review but must never apply a queue-changing action.
- When symptoms suggest immediate danger, clearly surface uncertainty and missing
  evidence to the reviewing clinician.
