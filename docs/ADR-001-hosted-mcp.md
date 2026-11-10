# ADR-001: Host a synthetic, authenticated MCP judge sandbox

**Status:** Accepted
**Date:** 2026-11-10
**Deciders:** Nuktas team

## Context

Technical judges need to connect an MCP client to Nuktas without installing the
dashboard. The endpoint must be testable from the internet, while real patient
data must stay inside the facility/country and irreversible actions must remain
clinician-gated.

## Decision

Host a separate **synthetic-data-only** Streamable HTTP MCP sandbox at
`https://<judge-domain>/mcp`. It exposes the same eight governed tools as the
stdio server, requires a rotated bearer token, rate-limits callers, and runs
behind Caddy TLS. It must never share a production hospital database.

The judge sandbox uses one synthetic clinic. A real hospital deployment remains
a hospital-local sidecar until OAuth, tenant-bound claims and a FHIR/HIS adapter
exist.

## Options considered

| Option | Complexity | Security | Judge usability | Decision |
|---|---:|---:|---:|---|
| Ask judges to run stdio locally | Low | High | Low | Rejected |
| Public stateless MCP + bearer token + synthetic DB | Medium | Medium/High | High | Accepted |
| Multi-tenant production MCP gateway | High | Requires OAuth/tenancy | High | Deferred |

## Consequences

- Judges can connect standard MCP clients directly.
- The hosted surface contains no real PHI and cannot compromise a hospital DB.
- A leaked judge token can access synthetic data, so it must be rotated and the
  service removed after judging.
- Bearer auth is sufficient for a time-boxed sandbox, not a production tenant.

## Deployment gate

Before sharing the URL: confirm TLS, a non-default token, synthetic records only,
host allow-list, rate limit, `tools/list`, one read tool, and the approval gate.
