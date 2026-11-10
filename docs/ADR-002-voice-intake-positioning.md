# ADR-002: Treat voice intake as an optional pilot channel

**Status:** Accepted
**Date:** 2026-11-10

## Context

Voice intake may help where typing, literacy, language preference, disability,
travel time, or a crowded triage desk make form entry difficult. But an animated
phone experience is not itself evidence that voice improves safety or throughput.
ASR errors can also omit clinically important words, background noise is common,
and collecting health information by voice requires explicit consent and privacy.

## Decision

Voice is removed from the primary queue navigation and finalist value proposition.
The implementation remains an **optional EN/SW intake pilot**, accessible only
when the team intentionally demonstrates it. The core product and demo begin at
the clinician queue: sourced SATS recommendation, review, approval and audit.

## Keep criteria

Promote voice into the main workflow only after a small facility pilot shows:

- complaint capture completeness versus nurse-entered intake;
- critical symptom word recall in English and Swahili;
- median intake time and correction rate;
- performance in realistic clinic noise;
- patient consent, language preference and a visible transcript-correction step;
- a nurse-confirmed handoff before the complaint reaches triage scoring.

## Removal criteria

Remove voice from the submission if it cannot complete a stable, consented,
editable intake in under two minutes, or if critical symptom recall is worse than
the assisted text workflow. Do not use “accessibility” as a claim without users.

## Consequences

The finalist story is narrower and safer. Voice can still demonstrate local
open-weights ASR and bilingual access, but it is not allowed to distract from or
weaken the governed clinical workflow.
