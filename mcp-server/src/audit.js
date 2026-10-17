'use strict';

/**
 * Append-only audit trail.
 *
 * Every MCP tool call writes exactly one row here, whether it succeeded or
 * failed, and whether it was a read or a write. The audit row records WHO (agent
 * or named user), WHAT (the tool), on WHICH subject, with the full arguments and
 * a result summary. `GET /api/v1/clinics/:id/audit` renders these to the nurse.
 */

const db = require('./db');

const MAX_PAYLOAD_BYTES = 20_000;

function trim(payload) {
  try {
    const s = JSON.stringify(payload ?? {});
    if (s.length <= MAX_PAYLOAD_BYTES) return payload ?? {};
    return { truncated: true, preview: s.slice(0, MAX_PAYLOAD_BYTES) };
  } catch {
    return { unserializable: true };
  }
}

/**
 * @param {object} e
 * @param {string}  [e.clinicId]
 * @param {'agent'|'user'|'system'|'mcp'} e.actorType
 * @param {string}  [e.actorId]
 * @param {string}  [e.actorName]
 * @param {string}   e.action          tool or endpoint name
 * @param {string}  [e.subjectType]
 * @param {string}  [e.subjectId]
 * @param {string}  [e.runId]
 * @param {object}  [e.payload]
 */
async function writeAudit(e) {
  const { rows } = await db.query(
    `INSERT INTO audit_events
       (clinic_id, actor_type, actor_id, actor_name, action, subject_type, subject_id, run_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, inserted_at`,
    [
      e.clinicId ?? null,
      e.actorType,
      e.actorId ?? null,
      e.actorName ?? null,
      e.action,
      e.subjectType ?? null,
      e.subjectId ?? null,
      e.runId ?? null,
      trim(e.payload),
    ]
  );
  return rows[0];
}

module.exports = { writeAudit };
