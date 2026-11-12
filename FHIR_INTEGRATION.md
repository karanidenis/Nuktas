# FHIR R4 interoperability sandbox

Nuktas includes a genuine HAPI FHIR JPA Server for technical evaluation and
hospital-dashboard integration. It is an interoperability read model: Nuktas
and its governed MCP remain the operational source of truth.

## Trust boundary

```text
clinician approval -> MCP applies queue change -> FHIR outbox -> HAPI FHIR R4
                                                       retry        |
                                                    audit event     v
                                                              hospital client
```

- Only a named, approved assessment is eligible for synchronization.
- A FHIR outage never rolls back a clinical decision or queue update.
- Every success and failure is audited, and failed jobs retry with exponential
  backoff.
- PUT entries use deterministic IDs, making transaction retries idempotent.
- The sandbox supports synthetic evaluation data. It is not a production EHR,
  national registry, or claim of regulatory certification.

## Start and discover

The standard Compose stack starts HAPI and its isolated PostgreSQL database:

```bash
docker compose up -d fhir-postgres fhir server
curl -s http://localhost:8080/fhir/metadata | jq '.fhirVersion, .rest[0].mode'
```

FHIR base URL: `http://localhost:8080/fhir`

After approving a recommendation, query its resources with the deterministic
Nuktas identifiers shown in the export:

```bash
curl -s 'http://localhost:8080/fhir/Patient?_count=20' | jq '.total'
curl -s 'http://localhost:8080/fhir/Observation?_count=20' | jq '.total'
curl -s 'http://localhost:8080/fhir/RiskAssessment?_count=20' | jq '.total'
curl -s 'http://localhost:8080/fhir/Provenance?_count=20' | jq '.total'
```

The authenticated Nuktas API also exposes:

- `GET /api/v1/clinics/:clinic_id/recommendations/:id/fhir` — portable
  collection Bundle with `fullUrl` identities.
- `GET /api/v1/clinics/:clinic_id/recommendations/:id/fhir/status` — outbox
  status and last error.
- `POST /api/v1/clinics/:clinic_id/recommendations/:id/fhir/sync` — clinician or
  administrator retry. Rejected recommendations return 409.

## Public deployment

Set `FHIR_PUBLIC_BASE_URL=https://fhir.example.org/fhir`. Put TLS and access
control in front of HAPI; the upstream starter deliberately provides no
production security implementation. Never expose the Compose default password
or reuse the synthetic sandbox for real patient data.

For a real facility deployment, add SMART on FHIR/OAuth 2.0, facility-specific
profiles and terminology bindings, Kenya-hosted infrastructure, consent and
retention policy, monitoring, backups, and formal conformance/security testing.

The pinned HAPI starter used roughly 850 MiB during local verification. Do not
place it on Render's smallest free instance and call the result reliable. For a
no-license-cost judge deployment, use a scale-to-zero container platform with
at least 1 GiB RAM plus a free external PostgreSQL sandbox, or a temporary
1 GiB VM. Keep the service synthetic-only until production security is added.

## Failure handling

The `fhir_sync_jobs` table records `pending`, `processing`, `synced`, or
`failed`. Stale processing locks are recovered after five minutes. Failed jobs
retry from five seconds up to five minutes; clinicians can also request an
immediate retry from the API.
