'use strict';

/**
 * The Nuktas Triage MCP tools.
 *
 * Design rules (all enforced here, not in the prompt):
 *   1. Every tool is clinic-scoped. A tool call that references a patient,
 *      queue entry, or assessment outside the named clinic fails closed.
 *   2. Read tools never mutate. Action tools write an audit row.
 *   3. The ONLY tool that can change a patient's queue position is
 *      `apply_approved_queue_update`, and it refuses to run unless a matching
 *      row in `approvals` says a named clinician approved it.
 *   4. Priority levels come from the deterministic SATS module, never the LLM.
 */

const { z } = require('zod');
const db = require('./db');
const { writeAudit } = require('./audit');
const sats = require('./sats');

// ── Small helpers ─────────────────────────────────────────────────────────────

const URGY = { critical: 4, high: 3, medium: 2, low: 1 };

function textResult(obj, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
    isError,
  };
}

function fail(message, extra = {}) {
  return textResult({ error: message, ...extra }, true);
}

const num = (v) => (v == null || v === '' ? undefined : Number(v));

/**
 * Pure decision for the irreversible queue update. Extracted so the gate can be
 * unit-tested without a database; the tool still fetches the rows and this
 * decides whether they open the gate.
 * @returns {{ ok: boolean, reason?: string, already_applied?: boolean }}
 */
function evaluateGate(assessment, approval) {
  if (!assessment) return { ok: false, reason: 'assessment_not_found' };
  if (assessment.applied_at) return { ok: true, already_applied: true };
  if (!assessment.queue_entry_id) return { ok: false, reason: 'not_linked_to_queue_entry' };
  if (!approval) return { ok: false, reason: 'no_approval' };
  if (approval.decision !== 'approved') return { ok: false, reason: 'rejected' };
  return { ok: true };
}

function actorOf(actor) {
  if (!actor) return { type: 'agent', name: 'triage-agent' };
  return { type: actor.type ?? 'agent', id: actor.id ?? null, name: actor.name ?? 'triage-agent' };
}

// ── Scope guards ──────────────────────────────────────────────────────────────

async function getClinicScope(clinicId) {
  const { rows } = await db.query(
    'SELECT id, name, organization_id FROM clinics WHERE id = $1 AND is_active = true',
    [clinicId]
  );
  if (!rows[0]) throw new Error(`Clinic ${clinicId} not found or inactive`);
  return rows[0];
}

async function getPatientInClinic(patientId, clinicId) {
  const { rows } = await db.query(
    `SELECT p.* FROM patients p
      WHERE p.id = $1
        AND EXISTS (
          SELECT 1 FROM queue_entries qe
           WHERE qe.patient_id = p.id AND qe.clinic_id = $2
        )`,
    [patientId, clinicId]
  );
  if (!rows[0]) throw new Error(`Patient ${patientId} is not registered at clinic ${clinicId}`);
  return rows[0];
}

async function getEntryInClinic(entryId, clinicId) {
  const { rows } = await db.query(
    `SELECT qe.*, p.name AS patient_name, p.age_years, p.height_cm
       FROM queue_entries qe
       LEFT JOIN patients p ON p.id = qe.patient_id
      WHERE qe.id = $1 AND qe.clinic_id = $2`,
    [entryId, clinicId]
  );
  if (!rows[0]) throw new Error(`Queue entry ${entryId} is not in clinic ${clinicId}`);
  return rows[0];
}

async function latestVitalsRow(clinicId, patientId) {
  const { rows } = await db.query(
    `SELECT * FROM vitals
      WHERE clinic_id = $1 AND patient_id = $2
      ORDER BY recorded_at DESC LIMIT 1`,
    [clinicId, patientId]
  );
  return rows[0] || null;
}

// ── SATS input assembly ───────────────────────────────────────────────────────

function toSatsInput(patient, vitals) {
  const v = vitals || {};
  return {
    ageYears: num(v.age_years ?? patient?.age_years),
    heightCm: num(v.height_cm ?? patient?.height_cm),
    mobility: v.mobility ?? undefined,
    respiratory_rate: num(v.respiratory_rate),
    heart_rate: num(v.heart_rate),
    systolic_bp: num(v.systolic_bp),
    temperature_c: num(v.temperature_c),
    avpu: v.avpu ?? undefined,
    trauma: typeof v.trauma === 'boolean' ? v.trauma : undefined,
    spo2: num(v.spo2),
  };
}

async function resolveDepartment(clinicId, hint, urgency) {
  if (hint) {
    const { rows } = await db.query(
      `SELECT id, name FROM departments
        WHERE clinic_id = $1 AND (lower(name) = lower($2) OR lower(code) = lower($2))
        LIMIT 1`,
      [clinicId, hint]
    );
    if (rows[0]) return { id: rows[0].id, name: rows[0].name, matched: true };
  }
  if (urgency === 'critical') {
    const { rows } = await db.query(
      `SELECT id, name FROM departments
        WHERE clinic_id = $1 AND is_emergency = true
        ORDER BY name LIMIT 1`,
      [clinicId]
    );
    if (rows[0]) return { id: rows[0].id, name: rows[0].name, matched: 'emergency_default' };
  }
  return { id: null, name: null, matched: false };
}

// ── Core: assess and store a recommendation ───────────────────────────────────

async function assessAndStore({
  clinicId, patientId, queueEntryId = null, providedVitals = {},
  clinicalSigns = [], departmentHint = null, chiefComplaint = null,
  actor = null, runId = null, kind = 'initial', reason = null,
}) {
  await getClinicScope(clinicId);
  const patient = await getPatientInClinic(patientId, clinicId);

  const latest = await latestVitalsRow(clinicId, patientId);
  const merged = { ...(latest || {}) };
  for (const [k, v] of Object.entries(providedVitals)) {
    if (v !== undefined && v !== null && v !== '') merged[k] = v;
  }
  const satsInput = toSatsInput(patient, merged);

  const result = sats.assess(satsInput, { clinicalSigns });
  const dept = await resolveDepartment(clinicId, departmentHint, result.urgency);

  const evidence = {
    scale: result.scale,
    scale_version: result.scale_version,
    source: result.source,
    vitals: satsInput,
    tews: result.tews,
    clinical_signs: result.clinical_signs,
    chief_complaint: chiefComplaint,
    reason,
  };

  const { rows } = await db.query(
    `INSERT INTO triage_assessments
       (clinic_id, patient_id, queue_entry_id, vitals_id, agent_run_id, kind,
        scale, scale_version, variant, tews_score, tews_breakdown, clinical_signs,
        recommended_urgency, sats_colour, target_minutes, recommended_department_id,
        recommended_department, rationale, evidence, confidence, missing_data,
        needs_more_data, status, requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'pending',$23)
     RETURNING *`,
    [
      clinicId, patientId, queueEntryId, latest?.id ?? null, runId, kind,
      result.scale, result.scale_version, result.variant, result.tews.total,
      JSON.stringify(result.tews.breakdown), JSON.stringify(result.clinical_signs),
      result.urgency, result.colour, result.target_minutes, dept.id,
      dept.name, result.rationale, JSON.stringify(evidence), result.confidence,
      result.missing_data, result.needs_more_data, actor?.type === 'agent' ? 'agent' : 'staff',
    ]
  );
  const assessment = rows[0];

  await writeAudit({
    clinicId,
    actorType: actorOf(actor).type,
    actorId: actorOf(actor).id,
    actorName: actorOf(actor).name,
    action: kind === 'deterioration' ? 'flag_deterioration_for_review' : 'assess_triage_priority',
    subjectType: 'triage_assessment',
    subjectId: assessment.id,
    runId,
    payload: {
      patient_id: patientId,
      queue_entry_id: queueEntryId,
      colour: result.colour,
      urgency: result.urgency,
      tews: result.tews.total,
      confidence: result.confidence,
      recommended_department: dept.name,
      status: 'pending',
    },
  });

  await db.notify('nuktas_events', {
    type: 'assessment_created',
    clinic_id: clinicId,
    assessment_id: assessment.id,
    queue_entry_id: queueEntryId,
    patient_id: patientId,
    urgency: result.urgency,
    sats_colour: result.colour,
    kind,
  });

  return { assessment, result, department: dept };
}

// ── Queue reordering (mirrors the clinic dashboard's ordering rule) ───────────

async function reorderQueue(departmentId) {
  if (!departmentId) return;
  const { rows } = await db.query(
    `SELECT id FROM queue_entries
      WHERE department_id = $1 AND status = 'waiting'
      ORDER BY CASE urgency_tier
                 WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
               inserted_at ASC`,
    [departmentId]
  );
  for (let i = 0; i < rows.length; i++) {
    await db.query(
      'UPDATE queue_entries SET position_in_queue = $1, updated_at = NOW() WHERE id = $2',
      [i + 1, rows[i].id]
    );
  }
}

async function fetchQueueEntry(entryId) {
  const { rows } = await db.query(
    `SELECT qe.id, qe.queue_number, qe.urgency_tier, qe.status, qe.position_in_queue,
            qe.department_id, qe.estimated_wait_time, qe.clinic_id,
            p.name AS patient_name, p.phone_number AS patient_phone
       FROM queue_entries qe
       LEFT JOIN patients p ON p.id = qe.patient_id
      WHERE qe.id = $1`,
    [entryId]
  );
  return rows[0] || null;
}

// ── Tool registration ─────────────────────────────────────────────────────────

const ACTOR_SCHEMA = z.object({
  type: z.enum(['agent', 'user', 'system']).optional(),
  id: z.string().optional(),
  name: z.string().optional(),
}).optional();

const VITALS_SCHEMA = z.object({
  respiratory_rate: z.number().optional(),
  heart_rate: z.number().optional(),
  systolic_bp: z.number().optional(),
  diastolic_bp: z.number().optional(),
  temperature_c: z.number().optional(),
  spo2: z.number().optional(),
  avpu: z.enum(['alert', 'confused', 'reacts_to_voice', 'reacts_to_pain', 'unresponsive']).optional(),
  mobility: z.enum(['walking', 'with_help', 'stretcher_immobile', 'wheelchair', 'normal', 'unable']).optional(),
  trauma: z.boolean().optional(),
  age_years: z.number().optional(),
  height_cm: z.number().optional(),
  notes: z.string().optional(),
});

function register(server, name, config, handler) {
  // Tolerate SDK version drift (`registerTool` in newer releases, `tool` in older).
  if (typeof server.registerTool === 'function') {
    return server.registerTool(name, config, handler);
  }
  return server.tool(name, config.description, config.inputSchema, handler);
}

/**
 * Register every Nuktas tool on an McpServer instance.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {{ log?: (msg: string, meta?: object) => void }} [opts]
 */
function registerTools(server, opts = {}) {
  const log = opts.log || (() => {});
  const wrap = (name, handler) => async (args, extra) => {
    const started = Date.now();
    try {
      const result = await handler(args || {}, extra);
      log(`tool ${name} ok`, { ms: Date.now() - started });
      return result;
    } catch (err) {
      log(`tool ${name} error`, { ms: Date.now() - started, error: err.message });
      // A tool failure is auditable too.
      try {
        await writeAudit({
          clinicId: args?.clinic_id ?? null,
          actorType: actorOf(args?.actor).type,
          actorId: actorOf(args?.actor).id,
          actorName: actorOf(args?.actor).name,
          action: name,
          runId: args?.run_id ?? null,
          payload: { error: err.message, args: Object.keys(args || {}) },
        });
      } catch { /* never mask the original error */ }
      return fail(err.message);
    }
  };

  // ── 1. get_waiting_queue (read) ─────────────────────────────────────────────
  register(server, 'get_waiting_queue', {
    title: 'Get waiting queue',
    description:
      'Return the current waiting queue for a clinic (active patients only), ordered by triage position. Use this to understand clinic load and who is waiting.',
    inputSchema: {
      clinic_id: z.string().describe('Clinic UUID'),
      department_id: z.string().optional().describe('Optional: restrict to one department UUID'),
      limit: z.number().int().min(1).max(100).optional().describe('Max rows (default 50)'),
    },
  }, wrap('get_waiting_queue', async ({ clinic_id, department_id, limit }) => {
    await getClinicScope(clinic_id);
    const params = [clinic_id];
    let where = `qe.clinic_id = $1 AND qe.status IN ('waiting','checked_in','in_progress')`;
    if (department_id) { params.push(department_id); where += ` AND qe.department_id = $${params.length}`; }
    params.push(limit ?? 50);
    const { rows } = await db.query(
      `SELECT qe.id AS queue_entry_id, qe.queue_number, qe.urgency_tier, qe.status,
              qe.position_in_queue, qe.estimated_wait_time, qe.inserted_at,
              p.id AS patient_id, p.name AS patient_name, p.age_years,
              d.name AS department
         FROM queue_entries qe
         LEFT JOIN patients p ON p.id = qe.patient_id
         LEFT JOIN departments d ON d.id = qe.department_id
        WHERE ${where}
        ORDER BY qe.position_in_queue ASC NULLS LAST, qe.inserted_at ASC
        LIMIT $${params.length}`,
      params
    );
    return textResult({ clinic_id, count: rows.length, queue: rows });
  }));

  // ── 2. get_latest_vitals (read) ─────────────────────────────────────────────
  register(server, 'get_latest_vitals', {
    title: 'Get latest vitals',
    description:
      'Return the most recent vital-sign set for a patient (by patient or queue entry). Use before assessing so the assessment is based on the freshest observations.',
    inputSchema: {
      clinic_id: z.string(),
      patient_id: z.string().optional(),
      queue_entry_id: z.string().optional(),
    },
  }, wrap('get_latest_vitals', async ({ clinic_id, patient_id, queue_entry_id }) => {
    await getClinicScope(clinic_id);
    let pid = patient_id;
    if (!pid && queue_entry_id) {
      const entry = await getEntryInClinic(queue_entry_id, clinic_id);
      pid = entry.patient_id;
    }
    if (!pid) return fail('Provide patient_id or queue_entry_id');
    await getPatientInClinic(pid, clinic_id);
    const row = await latestVitalsRow(clinic_id, pid);
    if (!row) return textResult({ patient_id: pid, vitals: null, message: 'No vitals recorded yet.' });
    return textResult({ patient_id: pid, vitals: row });
  }));

  // ── 3. get_patient_history (read) ───────────────────────────────────────────
  register(server, 'get_patient_history', {
    title: 'Get patient history',
    description:
      'Return a patient\'s profile (age, chronic conditions, known risks) plus recent visits. Use to spot chronic conditions that change how a reading should be interpreted.',
    inputSchema: {
      clinic_id: z.string(),
      patient_id: z.string(),
    },
  }, wrap('get_patient_history', async ({ clinic_id, patient_id }) => {
    await getClinicScope(clinic_id);
    const patient = await getPatientInClinic(patient_id, clinic_id);
    const { rows: visits } = await db.query(
      `SELECT c.id, c.chief_complaint, c.symptoms, c.urgency_tier, c.red_flag_detected,
              c.inserted_at
         FROM calls c
        WHERE c.patient_id = $1 AND c.clinic_id = $2
        ORDER BY c.inserted_at DESC LIMIT 5`,
      [patient_id, clinic_id]
    );
    return textResult({
      patient: {
        id: patient.id,
        name: patient.name,
        age_years: patient.age_years,
        height_cm: patient.height_cm,
        sex: patient.sex,
        chronic_conditions: patient.chronic_conditions ?? [],
        preferred_language: patient.preferred_language,
        visit_count: patient.visit_count,
      },
      recent_visits: visits,
    });
  }));

  // ── 4. record_vitals (action) ───────────────────────────────────────────────
  register(server, 'record_vitals', {
    title: 'Record vitals',
    description:
      'Persist a set of observations (vitals) for a patient against a queue entry. Implausible values are rejected with guidance so a nurse can re-measure rather than a wrong number entering the record.',
    inputSchema: {
      clinic_id: z.string(),
      patient_id: z.string(),
      queue_entry_id: z.string().optional(),
      source: z.enum(['staff_entry', 'voice', 'asr', 'device']).optional(),
      actor: ACTOR_SCHEMA,
      run_id: z.string().optional(),
      vitals: VITALS_SCHEMA,
    },
  }, wrap('record_vitals', async ({ clinic_id, patient_id, queue_entry_id, source, actor, run_id, vitals }) => {
    await getClinicScope(clinic_id);
    await getPatientInClinic(patient_id, clinic_id);
    if (queue_entry_id) await getEntryInClinic(queue_entry_id, clinic_id);

    // Reject values outside plausibility bounds before they reach the record.
    const rejected = [];
    const v = vitals || {};
    if (v.respiratory_rate != null && !(v.respiratory_rate >= sats.PLAUSIBLE.rr.min && v.respiratory_rate <= sats.PLAUSIBLE.rr.max)) rejected.push('respiratory_rate');
    if (v.heart_rate != null && !(v.heart_rate >= sats.PLAUSIBLE.hr.min && v.heart_rate <= sats.PLAUSIBLE.hr.max)) rejected.push('heart_rate');
    if (v.systolic_bp != null && !(v.systolic_bp >= sats.PLAUSIBLE.sbp.min && v.systolic_bp <= sats.PLAUSIBLE.sbp.max)) rejected.push('systolic_bp');
    if (v.temperature_c != null && !(v.temperature_c >= sats.PLAUSIBLE.tempC.min && v.temperature_c <= sats.PLAUSIBLE.tempC.max)) rejected.push('temperature_c');
    if (v.spo2 != null && !(v.spo2 >= sats.PLAUSIBLE.spo2.min && v.spo2 <= sats.PLAUSIBLE.spo2.max)) rejected.push('spo2');
    if (rejected.length) {
      return fail(`Implausible measurement(s): ${rejected.join(', ')}. Please re-measure.`, { rejected });
    }

    const a = actorOf(actor);
    const { rows } = await db.query(
      `INSERT INTO vitals
         (clinic_id, patient_id, queue_entry_id, recorded_by, recorded_by_name, source,
          respiratory_rate, heart_rate, systolic_bp, diastolic_bp, temperature_c, spo2,
          avpu, mobility, trauma, age_years, height_cm, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        clinic_id, patient_id, queue_entry_id ?? null,
        a.type === 'user' ? a.id : null, a.name, source ?? 'staff_entry',
        num(v.respiratory_rate) ?? null, num(v.heart_rate) ?? null, num(v.systolic_bp) ?? null,
        num(v.diastolic_bp) ?? null, num(v.temperature_c) ?? null, num(v.spo2) ?? null,
        v.avpu ?? null, v.mobility ?? null, v.trauma ?? null,
        num(v.age_years) ?? null, num(v.height_cm) ?? null, v.notes ?? null,
      ]
    );
    const row = rows[0];
    await writeAudit({
      clinicId: clinic_id, actorType: a.type, actorId: a.id, actorName: a.name,
      action: 'record_vitals', subjectType: 'vitals', subjectId: row.id, runId: run_id,
      payload: { patient_id, queue_entry_id, source: row.source },
    });
    await db.notify('nuktas_events', {
      type: 'vitals_recorded', clinic_id, patient_id, queue_entry_id: queue_entry_id ?? null, vitals_id: row.id,
    });
    return textResult({ ok: true, vitals_id: row.id, recorded_at: row.recorded_at });
  }));

  // ── 5. assess_triage_priority (action — the core tool) ──────────────────────
  register(server, 'assess_triage_priority', {
    title: 'Assess triage priority (SATS)',
    description:
      'Score a patient with the South African Triage Scale (SATS) using current vitals and any clinical signs found. Returns a sourced priority colour, target time, TEWS breakdown and confidence. Creates a PENDING recommendation only — it never moves the patient in the queue. A nurse must approve it.',
    inputSchema: {
      clinic_id: z.string(),
      patient_id: z.string(),
      queue_entry_id: z.string().optional(),
      chief_complaint: z.string().optional(),
      department_hint: z.string().optional().describe('Suggested department name or code; validated against the clinic.'),
      clinical_signs: z.array(z.string()).optional().describe('SATS clinical-sign codes, e.g. not_breathing, severe_pain'),
      vitals: VITALS_SCHEMA.optional(),
      actor: ACTOR_SCHEMA,
      run_id: z.string().optional(),
    },
  }, wrap('assess_triage_priority', async (args) => {
    const { assessment, result, department } = await assessAndStore({
      clinicId: args.clinic_id,
      patientId: args.patient_id,
      queueEntryId: args.queue_entry_id ?? null,
      providedVitals: args.vitals ?? {},
      clinicalSigns: args.clinical_signs ?? [],
      departmentHint: args.department_hint ?? null,
      chiefComplaint: args.chief_complaint ?? null,
      actor: args.actor ?? { type: 'agent' },
      runId: args.run_id ?? null,
      kind: 'initial',
    });
    return textResult({
      assessment_id: assessment.id,
      status: assessment.status,
      scale: assessment.scale,
      scale_version: assessment.scale_version,
      variant: assessment.variant,
      tews_score: assessment.tews_score,
      tews_breakdown: result.tews.breakdown,
      clinical_signs: result.clinical_signs,
      recommended_urgency: assessment.recommended_urgency,
      sats_colour: assessment.sats_colour,
      target_minutes: assessment.target_minutes,
      recommended_department: department.name,
      confidence: assessment.confidence,
      missing_data: assessment.missing_data,
      needs_more_data: assessment.needs_more_data,
      rationale: assessment.rationale,
      sources: assessment.evidence?.source?.figures,
      note: 'Pending clinician approval. This did not change the queue.',
    });
  }));

  // ── 6. flag_deterioration_for_review (action) ───────────────────────────────
  register(server, 'flag_deterioration_for_review', {
    title: 'Flag deterioration for review',
    description:
      'Compare a patient against their previous assessment using fresh vitals or a reported change. If the SATS priority has worsened, creates a PENDING deterioration re-check for a nurse. It raises a second look; it does not act.',
    inputSchema: {
      clinic_id: z.string(),
      patient_id: z.string(),
      queue_entry_id: z.string().optional(),
      reason: z.string().describe('What changed (patient-reported or observed)'),
      clinical_signs: z.array(z.string()).optional(),
      vitals: VITALS_SCHEMA.optional(),
      actor: ACTOR_SCHEMA,
      run_id: z.string().optional(),
    },
  }, wrap('flag_deterioration_for_review', async (args) => {
    await getClinicScope(args.clinic_id);
    await getPatientInClinic(args.patient_id, args.clinic_id);

    // Previous priority, if any.
    const { rows: prevRows } = await db.query(
      `SELECT recommended_urgency, sats_colour, tews_score FROM triage_assessments
        WHERE clinic_id = $1 AND patient_id = $2
        ORDER BY inserted_at DESC LIMIT 1`,
      [args.clinic_id, args.patient_id]
    );
    const previous = prevRows[0] || null;

    const { assessment, result, department } = await assessAndStore({
      clinicId: args.clinic_id,
      patientId: args.patient_id,
      queueEntryId: args.queue_entry_id ?? null,
      providedVitals: args.vitals ?? {},
      clinicalSigns: args.clinical_signs ?? [],
      chiefComplaint: null,
      actor: args.actor ?? { type: 'agent' },
      runId: args.run_id ?? null,
      kind: 'deterioration',
      reason: args.reason,
    });

    const prevRank = previous ? (URGY[previous.recommended_urgency] ?? 0) : 0;
    const nowRank = URGY[assessment.recommended_urgency] ?? 0;
    const worsened = nowRank > prevRank;

    // Keep the row but make the re-check nature explicit in the rationale.
    const note = worsened
      ? `Deterioration: priority worsened from ${previous?.recommended_urgency ?? 'unknown'} to ${assessment.recommended_urgency}.`
      : `No priority change (${assessment.recommended_urgency}). Flagged for a second look because: ${args.reason}.`;

    await db.query(
      `UPDATE triage_assessments SET rationale = $2, updated_at = NOW() WHERE id = $1`,
      [assessment.id, `${note} ${assessment.rationale}`]
    );

    if (!worsened) {
      await db.query(
        `UPDATE triage_assessments SET status = 'superseded', updated_at = NOW() WHERE id = $1`,
        [assessment.id]
      );
    }

    return textResult({
      assessment_id: assessment.id,
      worsened,
      previous_urgency: previous?.recommended_urgency ?? null,
      current_urgency: assessment.recommended_urgency,
      sats_colour: assessment.sats_colour,
      tews_score: assessment.tews_score,
      target_minutes: assessment.target_minutes,
      recommended_department: department.name,
      status: worsened ? assessment.status : 'superseded',
      note: worsened
        ? 'Deterioration re-check created, awaiting nurse review. Queue unchanged.'
        : 'No change detected; no re-check raised.',
    });
  }));

  // ── 7. request_clinician_approval (action) ──────────────────────────────────
  register(server, 'request_clinician_approval', {
    title: 'Request clinician approval',
    description:
      'Put a pending recommendation in front of the triage nurse (raises it on the dashboard and notifies the clinic channel). Use this once a recommendation is ready to review.',
    inputSchema: {
      clinic_id: z.string(),
      assessment_id: z.string(),
      message: z.string().optional(),
      actor: ACTOR_SCHEMA,
      run_id: z.string().optional(),
    },
  }, wrap('request_clinician_approval', async ({ clinic_id, assessment_id, message, actor, run_id }) => {
    await getClinicScope(clinic_id);
    const { rows } = await db.query(
      `SELECT * FROM triage_assessments WHERE id = $1 AND clinic_id = $2`,
      [assessment_id, clinic_id]
    );
    if (!rows[0]) return fail('Assessment not found in this clinic');
    if (['approved', 'rejected', 'applied'].includes(rows[0].status)) {
      return textResult({ ok: true, status: rows[0].status, message: 'Already decided.' });
    }
    await db.query(
      `UPDATE triage_assessments SET status = 'awaiting_approval', updated_at = NOW() WHERE id = $1`,
      [assessment_id]
    );
    await writeAudit({
      clinicId: clinic_id, actorType: actorOf(actor).type, actorId: actorOf(actor).id,
      actorName: actorOf(actor).name, action: 'request_clinician_approval',
      subjectType: 'triage_assessment', subjectId: assessment_id, runId: run_id,
      payload: { message: message ?? null },
    });
    await db.notify('nuktas_events', {
      type: 'approval_requested', clinic_id, assessment_id, queue_entry_id: rows[0].queue_entry_id,
      urgency: rows[0].recommended_urgency,
    });
    return textResult({ ok: true, status: 'awaiting_approval', assessment_id });
  }));

  // ── 8. apply_approved_queue_update (action — the irreversible gate) ─────────
  register(server, 'apply_approved_queue_update', {
    title: 'Apply approved queue update',
    description:
      'The ONLY tool that changes a patient\'s queue position or priority. It refuses to run unless a named clinician has approved this exact assessment (a row in `approvals` with decision=approved). Applies the priority and department, reorders the queue, and records the approval in the audit trail.',
    inputSchema: {
      clinic_id: z.string(),
      assessment_id: z.string(),
      approval_id: z.string().describe('The clinician approval record for this assessment'),
      actor: ACTOR_SCHEMA,
      run_id: z.string().optional(),
    },
  }, wrap('apply_approved_queue_update', async ({ clinic_id, assessment_id, approval_id, actor, run_id }) => {
    await getClinicScope(clinic_id);

    const { rows: aRows } = await db.query(
      `SELECT * FROM triage_assessments WHERE id = $1 AND clinic_id = $2`,
      [assessment_id, clinic_id]
    );
    const assessment = aRows[0];
    if (!assessment) return fail('Assessment not found in this clinic');

    const { rows: apRows } = await db.query(
      `SELECT * FROM approvals WHERE id = $1 AND assessment_id = $2 AND clinic_id = $3`,
      [approval_id, assessment_id, clinic_id]
    );
    const approval = apRows[0];

    const gate = evaluateGate(assessment, approval);
    if (gate.already_applied) {
      return textResult({ ok: true, already_applied: true, status: assessment.status });
    }
    if (!gate.ok) {
      const messages = {
        not_linked_to_queue_entry: 'Assessment is not linked to a queue entry',
        no_approval: 'No clinician approval found for this assessment (the gate held)',
        rejected: 'Clinician rejected or did not approve this assessment (the gate held)',
      };
      return fail(messages[gate.reason] || 'Approval gate did not open');
    }

    const entry = await getEntryInClinic(assessment.queue_entry_id, clinic_id);

    // Apply: priority + department. Position is recomputed by reorderQueue.
    await db.query(
      `UPDATE queue_entries
          SET urgency_tier = $2,
              department_id = COALESCE($3, department_id),
              updated_at = NOW()
        WHERE id = $1`,
      [entry.id, assessment.recommended_urgency, assessment.recommended_department_id]
    );
    await db.query(
      `UPDATE triage_assessments
          SET status = 'applied', applied_at = NOW(), decided_by = $2,
              decided_by_name = $3, decided_at = COALESCE(decided_at, NOW()), updated_at = NOW()
        WHERE id = $1`,
      [assessment_id, approval.decided_by, approval.decided_by_name]
    );

    const { rows: after } = await db.query(
      'SELECT department_id FROM queue_entries WHERE id = $1',
      [entry.id]
    );
    await reorderQueue(after[0]?.department_id);

    const updated = await fetchQueueEntry(entry.id);

    await writeAudit({
      clinicId: clinic_id, actorType: actorOf(actor).type, actorId: actorOf(actor).id,
      actorName: actorOf(actor).name, action: 'apply_approved_queue_update',
      subjectType: 'queue_entry', subjectId: entry.id, runId: run_id,
      payload: {
        assessment_id, approval_id,
        approved_by: approval.decided_by_name,
        approved_by_role: approval.decided_by_role,
        from_urgency: entry.urgency_tier,
        to_urgency: assessment.recommended_urgency,
      },
    });

    await db.notify('nuktas_events', {
      type: 'queue_update_applied', clinic_id, queue_entry_id: entry.id,
      assessment_id, approval_id, urgency: assessment.recommended_urgency,
      approved_by: approval.decided_by_name,
    });

    return textResult({
      ok: true,
      queue_entry_id: entry.id,
      from_urgency: entry.urgency_tier,
      to_urgency: assessment.recommended_urgency,
      department: updated?.department_id,
      approved_by: approval.decided_by_name,
      approved_by_role: approval.decided_by_role,
      applied_at: new Date().toISOString(),
    });
  }));

  return server;
}

module.exports = { registerTools, assessAndStore, evaluateGate, URGY };
