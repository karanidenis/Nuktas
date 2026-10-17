'use strict';

/**
 * Database helpers for the governed triage workflow: recommendations,
 * approvals, agent runs, and the audit trail.
 *
 * The HTTP layer never writes these tables with ad-hoc SQL — it goes through
 * here so the shape stays consistent and every write is easy to audit.
 */

const db = require('../db');

const OPEN_STATUSES = ['pending', 'awaiting_approval'];

// ── Recommendations ───────────────────────────────────────────────────────────

function formatRecommendation(row) {
  return {
    id: row.id,
    clinic_id: row.clinic_id,
    patient_id: row.patient_id,
    queue_entry_id: row.queue_entry_id,
    kind: row.kind,
    scale: row.scale,
    scale_version: row.scale_version,
    variant: row.variant,
    tews_score: row.tews_score,
    tews_breakdown: row.tews_breakdown ?? [],
    clinical_signs: row.clinical_signs ?? [],
    recommended_urgency: row.recommended_urgency,
    sats_colour: row.sats_colour,
    target_minutes: row.target_minutes,
    recommended_department: row.recommended_department,
    recommended_department_id: row.recommended_department_id,
    rationale: row.rationale,
    evidence: row.evidence ?? {},
    confidence: row.confidence,
    missing_data: row.missing_data ?? [],
    needs_more_data: row.needs_more_data,
    status: row.status,
    requested_by: row.requested_by,
    decided_by_name: row.decided_by_name,
    decided_at: row.decided_at,
    decision_note: row.decision_note,
    applied_at: row.applied_at,
    inserted_at: row.inserted_at,
    patient: row.patient_name
      ? {
          id: row.patient_id,
          name: row.patient_name,
          age_years: row.age_years,
          phone_number: row.patient_phone,
        }
      : null,
    queue_entry: row.queue_entry_id
      ? {
          id: row.queue_entry_id,
          queue_number: row.queue_number,
          status: row.entry_status,
          current_urgency: row.current_urgency,
          position_in_queue: row.position_in_queue,
        }
      : null,
  };
}

async function listRecommendations(clinicId, statuses = OPEN_STATUSES, limit = 50) {
  const { rows } = await db.query(
    `SELECT a.*, p.name AS patient_name, p.age_years, p.phone_number AS patient_phone,
            qe.queue_number, qe.status AS entry_status,
            qe.urgency_tier AS current_urgency, qe.position_in_queue
       FROM triage_assessments a
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN queue_entries qe ON qe.id = a.queue_entry_id
      WHERE a.clinic_id = $1 AND a.status = ANY($2)
      ORDER BY CASE a.recommended_urgency
                 WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                 WHEN 'medium' THEN 3 ELSE 4 END,
               a.inserted_at DESC
      LIMIT $3`,
    [clinicId, statuses, limit]
  );
  return rows.map(formatRecommendation);
}

async function getAssessment(id, clinicId) {
  const { rows } = await db.query(
    `SELECT a.*, p.name AS patient_name, p.age_years, p.phone_number AS patient_phone,
            qe.queue_number, qe.status AS entry_status,
            qe.urgency_tier AS current_urgency, qe.position_in_queue
       FROM triage_assessments a
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN queue_entries qe ON qe.id = a.queue_entry_id
      WHERE a.id = $1 AND a.clinic_id = $2`,
    [id, clinicId]
  );
  return rows[0] ? formatRecommendation(rows[0]) : null;
}

async function setAssessmentStatus(id, status, extra = {}) {
  const sets = ['status = $2', 'updated_at = NOW()'];
  const vals = [id, status];
  if (extra.decidedByName) { vals.push(extra.decidedByName); sets.push(`decided_by_name = $${vals.length}`); }
  if (extra.decidedBy) { vals.push(extra.decidedBy); sets.push(`decided_by = $${vals.length}`); }
  if (extra.decisionNote) { vals.push(extra.decisionNote); sets.push(`decision_note = $${vals.length}`); }
  if (extra.markDecided) sets.push('decided_at = COALESCE(decided_at, NOW())');
  await db.query(`UPDATE triage_assessments SET ${sets.join(', ')} WHERE id = $1`, vals);
}

// ── Approvals (the gate record) ───────────────────────────────────────────────

async function upsertApproval({ assessmentId, clinicId, decision, decidedBy, decidedByName, role, note }) {
  const { rows } = await db.query(
    `INSERT INTO approvals (assessment_id, clinic_id, decision, decided_by, decided_by_name, decided_by_role, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (assessment_id) DO UPDATE
       SET decision = EXCLUDED.decision,
           decided_by = EXCLUDED.decided_by,
           decided_by_name = EXCLUDED.decided_by_name,
           decided_by_role = EXCLUDED.decided_by_role,
           note = EXCLUDED.note,
           inserted_at = NOW()
     RETURNING *`,
    [assessmentId, clinicId, decision, decidedBy, decidedByName, role ?? null, note ?? null]
  );
  return rows[0];
}

async function getApprovalForAssessment(assessmentId) {
  const { rows } = await db.query(
    'SELECT * FROM approvals WHERE assessment_id = $1',
    [assessmentId]
  );
  return rows[0] || null;
}

// ── Audit trail ───────────────────────────────────────────────────────────────

async function writeAudit(e) {
  const { rows } = await db.query(
    `INSERT INTO audit_events
       (clinic_id, actor_type, actor_id, actor_name, action, subject_type, subject_id, run_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, inserted_at`,
    [
      e.clinicId ?? null, e.actorType, e.actorId ?? null, e.actorName ?? null,
      e.action, e.subjectType ?? null, e.subjectId ?? null, e.runId ?? null,
      e.payload ?? {},
    ]
  );
  return rows[0];
}

async function listAudit(clinicId, { runId = null, limit = 100 } = {}) {
  const params = [clinicId];
  let where = 'clinic_id = $1';
  if (runId) { params.push(runId); where += ` AND run_id = $${params.length}`; }
  params.push(Math.min(limit, 500));
  const { rows } = await db.query(
    `SELECT id, actor_type, actor_id, actor_name, action, subject_type, subject_id, run_id, payload, inserted_at
       FROM audit_events
      WHERE ${where}
      ORDER BY inserted_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

// ── Agent runs ────────────────────────────────────────────────────────────────

async function createAgentRun(attrs) {
  const { rows } = await db.query(
    `INSERT INTO agent_runs
       (clinic_id, patient_id, queue_entry_id, trigger, language, model, provider, status, input)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'running',$8)
     RETURNING *`,
    [
      attrs.clinicId, attrs.patientId ?? null, attrs.queueEntryId ?? null,
      attrs.trigger ?? 'dashboard', attrs.language ?? 'en',
      attrs.model ?? null, attrs.provider ?? null, attrs.input ?? {},
    ]
  );
  return rows[0];
}

async function appendRunStep(id, step) {
  await db.query(
    `UPDATE agent_runs
        SET steps = steps || $2::jsonb, updated_at = NOW()
      WHERE id = $1`,
    [id, JSON.stringify([step])]
  );
}

async function updateAgentRun(id, fields = {}) {
  const sets = [];
  const vals = [id];
  const map = {
    status: 'status', summary: 'summary', assessment_id: 'assessment_id',
    error: 'error', tokens_in: 'tokens_in', tokens_out: 'tokens_out', duration_ms: 'duration_ms',
    model: 'model', provider: 'provider', language: 'language',
  };
  for (const [key, col] of Object.entries(map)) {
    if (fields[key] !== undefined) { vals.push(fields[key]); sets.push(`${col} = $${vals.length}`); }
  }
  if (fields.finished) sets.push('finished_at = NOW()');
  if (!sets.length) return;
  sets.push('updated_at = NOW()');
  await db.query(`UPDATE agent_runs SET ${sets.join(', ')} WHERE id = $1`, vals);
}

async function getAgentRun(id) {
  const { rows } = await db.query('SELECT * FROM agent_runs WHERE id = $1', [id]);
  return rows[0] || null;
}

async function listAgentRuns(clinicId, limit = 25) {
  const { rows } = await db.query(
    `SELECT id, clinic_id, patient_id, queue_entry_id, trigger, language, model, provider,
            status, summary, assessment_id, error, duration_ms, started_at, finished_at,
            jsonb_array_length(steps) AS step_count
       FROM agent_runs
      WHERE clinic_id = $1
      ORDER BY started_at DESC
      LIMIT $2`,
    [clinicId, Math.min(limit, 100)]
  );
  return rows;
}

module.exports = {
  OPEN_STATUSES,
  listRecommendations,
  getAssessment,
  setAssessmentStatus,
  upsertApproval,
  getApprovalForAssessment,
  writeAudit,
  listAudit,
  createAgentRun,
  appendRunStep,
  updateAgentRun,
  getAgentRun,
  listAgentRuns,
  formatRecommendation,
};
