# Using Nuktas MCP without the Nuktas dashboard

## Supported now: hospital-local sidecar

A hospital may run the Nuktas triage MCP server inside its own network and add
it to any stdio-capable MCP host. The React dashboard is optional. The server
still requires PostgreSQL with the Nuktas schema because its approval gate,
clinic scope and append-only audit records live there.

```json
{
  "mcpServers": {
    "nuktas-triage": {
      "command": "node",
      "args": ["/absolute/path/to/Nuktas/mcp-server/src/index.js"],
      "env": {
        "MCP_DATABASE_URL": "postgresql://USER:PASSWORD@HOST/nuktas"
      }
    }
  }
}
```

Install dependencies once with `npm ci --omit=dev --prefix mcp-server`. The MCP
host will discover eight tools. The model-facing Nuktas agent intentionally
hides `apply_approved_queue_update`; a hospital application should likewise
reserve it for its trusted clinician-approval service.

## What this enables

- Keep data and model execution inside the hospital or country boundary.
- Call the tools from an existing clinical assistant or MCP-capable workflow.
- Reuse deterministic SATS scoring, the named-clinician gate and audit trail
  without using the Nuktas web UI.

## Hosted judge sandbox

The repository includes a stateless Streamable HTTP transport for technical
evaluation. It uses the same eight tools, requires a bearer token, and is
designed for a separate synthetic-data-only database.

```json
{
  "mcpServers": {
    "nuktas-judge": {
      "url": "https://YOUR_DOMAIN/mcp",
      "headers": { "Authorization": "Bearer JUDGE_TOKEN" }
    }
  }
}
```

Deploy it on a Docker host after pointing a domain at that host:

```bash
export MCP_DOMAIN=mcp.example.org
export MCP_REMOTE_TOKEN='generate-a-long-random-value'
export POSTGRES_PASSWORD='generate-a-different-random-value'
export JWT_SECRET='generate-a-third-random-value'
export AGENT_SERVICE_TOKEN='generate-a-fourth-random-value'
docker compose -f docker-compose.mcp-judge.yml up --build -d
```

Only Caddy is public. PostgreSQL and the bootstrap API stay private. Rotate the
judge token and destroy the synthetic database volume after evaluation. See
[`docs/ADR-001-hosted-mcp.md`](docs/ADR-001-hosted-mcp.md).

### Free Render deployment

For hackathon evaluation, `render.yaml` defines a free Render Blueprint with:

- one Docker web service using `mcp-server/Dockerfile.render`;
- one free PostgreSQL database in the same Frankfurt region;
- an idempotent schema migration and synthetic seed at startup;
- the custom domain `mcp.nuktas.robopotato.co`; and
- a required secret `MCP_REMOTE_TOKEN` entered during Blueprint creation.

Deploy the repository as a Blueprint in the Render dashboard. When prompted for
`MCP_REMOTE_TOKEN`, provide a long random value and save it outside the
repository. Add the DNS record Render displays for the custom domain, then test:

```bash
curl https://mcp.nuktas.robopotato.co/health
MCP_URL=https://mcp.nuktas.robopotato.co/mcp \
MCP_REMOTE_TOKEN='the-secret-token' \
npm --prefix mcp-server run smoke:remote
```

The smoke command uses the official MCP client, discovers all eight tools, and
calls `get_waiting_queue` against the synthetic clinic. Stable sandbox IDs for
technical testing are:

```text
clinic_id      00000000-0000-4000-8000-000000000101
patient_id     00000000-0000-4000-8000-000000000401
queue_entry_id 00000000-0000-4000-8000-000000000601
```

Render free web services can sleep when idle, and free Render PostgreSQL expires
after 30 days. Treat this as a short-lived evaluation endpoint, open `/health`
before a scheduled demo, and replace or redeploy the database before expiry.

## Not supported yet in production

The judge endpoint is not a production multi-tenant gateway. It does not provide
OAuth tenant provisioning, FHIR/HL7 adapters, or mappings to arbitrary hospital
databases. A production gateway still needs tenant-bound claims, key rotation,
consent and retention controls, and a hospital-specific FHIR/HIS adapter.
