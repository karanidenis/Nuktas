'use strict';

const db = require('../db');
const triage = require('../models/triage');

const DEFAULT_TIMEOUT_MS = 12_000;
let workerTimer = null;
let workerBusy = false;

function baseUrl() {
  return String(process.env.FHIR_BASE_URL || '').replace(/\/$/, '');
}

function publicBaseUrl() {
  return String(process.env.FHIR_PUBLIC_BASE_URL || process.env.FHIR_BASE_URL || 'http://localhost:8080/fhir').replace(/\/$/, '');
}

async function loadPacket(clinicId, assessmentId) {
  const assessment = await triage.getAssessment(assessmentId, clinicId);
  if (!assessment) return null;
  const [approval, vitalsResult, clinicResult, auditResult] = await Promise.all([
    triage.getApprovalForAssessment(assessmentId),
    db.query(
      `SELECT * FROM vitals WHERE clinic_id = $1 AND patient_id = $2
       ORDER BY recorded_at DESC LIMIT 1`,
      [clinicId, assessment.patient_id]
    ),
    db.query('SELECT id, name, code, location FROM clinics WHERE id = $1', [clinicId]),
    db.query(
      `SELECT id, actor_type, actor_name, action, payload, inserted_at
       FROM audit_events WHERE clinic_id = $1 AND subject_id = $2
       ORDER BY inserted_at ASC`,
      [clinicId, assessmentId]
    ),
  ]);
  return {
    document_type: 'Nuktas governed triage handoff',
    generated_at: new Date().toISOString(),
    synthetic: Boolean(assessment.patient?.phone_number?.startsWith('+25470099')),
    clinic: clinicResult.rows[0] || null,
    patient: assessment.patient,
    queue_entry: assessment.queue_entry,
    assessment,
    latest_vitals: vitalsResult.rows[0] || null,
    clinician_decision: approval ? {
      decision: approval.decision,
      clinician_name: approval.decided_by_name,
      clinician_role: approval.decided_by_role,
      selected_urgency: assessment.clinician_urgency,
      reason: assessment.decision_reason,
      note: approval.note,
      decided_at: approval.inserted_at,
    } : null,
    audit_reference: auditResult.rows,
    disclaimer: 'Decision support only. This document is not a diagnosis or treatment plan.',
  };
}

function entry(resource, base, transaction) {
  const item = {
    fullUrl: `${base}/${resource.resourceType}/${resource.id}`,
    resource,
  };
  if (transaction) item.request = { method: 'PUT', url: `${resource.resourceType}/${resource.id}` };
  return item;
}

function buildBundle(packet, { transaction = false, base = publicBaseUrl() } = {}) {
  const a = packet.assessment;
  const v = packet.latest_vitals || {};
  const d = packet.clinician_decision;
  const patientRef = `Patient/${a.patient_id}`;
  const encounterId = a.queue_entry_id || a.id;
  const resources = [
    { resourceType: 'Patient', id: a.patient_id, name: [{ text: packet.patient?.name || 'Unknown' }] },
    { resourceType: 'Encounter', id: encounterId, status: packet.queue_entry?.status === 'completed' ? 'finished' : 'in-progress', class: { code: 'AMB', display: 'ambulatory' }, subject: { reference: patientRef } },
  ];
  const observations = [
    ['respiratory-rate', 'Respiratory rate', v.respiratory_rate, '/min'],
    ['heart-rate', 'Heart rate', v.heart_rate, '/min'],
    ['systolic-bp', 'Systolic blood pressure', v.systolic_bp, 'mm[Hg]'],
    ['diastolic-bp', 'Diastolic blood pressure', v.diastolic_bp, 'mm[Hg]'],
    ['body-temperature', 'Body temperature', v.temperature_c, 'Cel'],
    ['oxygen-saturation', 'Oxygen saturation', v.spo2, '%'],
  ].filter(([, , value]) => value != null).map(([code, display, value, unit]) => ({
    resourceType: 'Observation', id: `${v.id || a.id}-${code}`, status: 'final',
    code: { text: display }, subject: { reference: patientRef }, encounter: { reference: `Encounter/${encounterId}` },
    effectiveDateTime: v.recorded_at || a.inserted_at, valueQuantity: { value: Number(value), unit },
  }));
  resources.push(...observations, {
    resourceType: 'RiskAssessment', id: a.id, status: d ? 'final' : 'preliminary',
    subject: { reference: patientRef }, encounter: { reference: `Encounter/${encounterId}` }, occurrenceDateTime: a.inserted_at,
    method: { text: `${a.scale || 'SATS'} ${a.scale_version || ''}`.trim() },
    prediction: [{ outcome: { text: `${a.sats_colour} / ${a.recommended_urgency}` }, rationale: a.rationale }],
    note: [{ text: packet.disclaimer }],
  });
  if (a.recommended_department) resources.push({
    resourceType: 'ServiceRequest', id: `route-${a.id}`,
    status: d?.decision === 'approved' ? 'active' : 'draft', intent: 'order',
    subject: { reference: patientRef }, encounter: { reference: `Encounter/${encounterId}` },
    code: { text: `Route to ${a.recommended_department}` },
    requester: d ? { display: d.clinician_name } : { display: 'Nuktas recommendation pending clinician review' },
  });
  resources.push({
    resourceType: 'Provenance', id: `provenance-${a.id}`, recorded: packet.generated_at,
    target: [{ reference: `RiskAssessment/${a.id}` }],
    agent: [
      { type: { text: 'author' }, who: { display: 'Nuktas governed triage agent' } },
      ...(d ? [{ type: { text: 'verifier' }, who: { display: d.clinician_name } }] : []),
    ],
  });
  return {
    resourceType: 'Bundle', type: transaction ? 'transaction' : 'collection',
    timestamp: packet.generated_at,
    meta: { tag: [{ code: packet.synthetic ? 'synthetic' : 'clinical-record' }] },
    entry: resources.map((resource) => entry(resource, base, transaction)),
  };
}

async function enqueueSync({ clinicId, assessmentId, force = false }) {
  const { rows } = await db.query(
    `INSERT INTO fhir_sync_jobs (clinic_id, assessment_id, status, next_attempt_at)
     VALUES ($1,$2,'pending',NOW())
     ON CONFLICT (assessment_id) DO UPDATE SET
       status = CASE WHEN fhir_sync_jobs.status = 'synced' AND NOT $3 THEN 'synced' ELSE 'pending' END,
       next_attempt_at = CASE WHEN fhir_sync_jobs.status = 'synced' AND NOT $3 THEN fhir_sync_jobs.next_attempt_at ELSE NOW() END,
       last_error = CASE WHEN fhir_sync_jobs.status = 'synced' AND NOT $3 THEN fhir_sync_jobs.last_error ELSE NULL END,
       updated_at = NOW()
     RETURNING *`,
    [clinicId, assessmentId, force]
  );
  return rows[0];
}

async function getSyncStatus(clinicId, assessmentId) {
  const { rows } = await db.query(
    `SELECT id, status, attempts, last_error, response_status, synced_at, next_attempt_at, created_at, updated_at
       FROM fhir_sync_jobs WHERE clinic_id=$1 AND assessment_id=$2`,
    [clinicId, assessmentId]
  );
  return rows[0] || null;
}

async function claimJob() {
  const { rows } = await db.query(
    `UPDATE fhir_sync_jobs SET status='processing', locked_at=NOW(), updated_at=NOW()
      WHERE id = (
        SELECT id FROM fhir_sync_jobs
         WHERE (status IN ('pending','failed') AND next_attempt_at <= NOW())
            OR (status='processing' AND locked_at < NOW() - INTERVAL '5 minutes')
         ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
      ) RETURNING *`
  );
  return rows[0] || null;
}

async function processJob(job) {
  const endpoint = baseUrl();
  if (!endpoint) throw new Error('FHIR_BASE_URL is not configured');
  const packet = await loadPacket(job.clinic_id, job.assessment_id);
  if (!packet) throw new Error('Assessment not found');
  if (packet.clinician_decision?.decision !== 'approved') throw new Error('Only clinician-approved assessments can sync');
  const bundle = buildBundle(packet, { transaction: true });
  const headers = { Accept: 'application/fhir+json', 'Content-Type': 'application/fhir+json' };
  if (process.env.FHIR_SERVER_TOKEN) headers.Authorization = `Bearer ${process.env.FHIR_SERVER_TOKEN}`;
  const response = await fetch(endpoint, {
    method: 'POST', headers, body: JSON.stringify(bundle),
    signal: AbortSignal.timeout(Number(process.env.FHIR_SYNC_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`FHIR server ${response.status}: ${text.slice(0, 500)}`);
  let responseBody = null;
  try { responseBody = text ? JSON.parse(text) : null; } catch { responseBody = { raw: text.slice(0, 2000) }; }
  await db.query(
    `UPDATE fhir_sync_jobs SET status='synced', attempts=attempts+1, response_status=$2,
       response=$3, last_error=NULL, synced_at=NOW(), locked_at=NULL, updated_at=NOW() WHERE id=$1`,
    [job.id, response.status, responseBody]
  );
  await triage.writeAudit({
    clinicId: job.clinic_id, actorType: 'system', actorName: 'FHIR sync worker',
    action: 'fhir_sync_succeeded', subjectType: 'triage_assessment', subjectId: job.assessment_id,
    payload: { job_id: job.id, endpoint, response_status: response.status, resource_count: bundle.entry.length },
  });
  return { ok: true, status: 'synced', response_status: response.status, resource_count: bundle.entry.length };
}

async function failJob(job, error) {
  const attempts = Number(job.attempts || 0) + 1;
  const delaySeconds = Math.min(300, 5 * (2 ** Math.min(attempts - 1, 6)));
  await db.query(
    `UPDATE fhir_sync_jobs SET status='failed', attempts=$2, last_error=$3,
       next_attempt_at=NOW()+make_interval(secs=>$4), locked_at=NULL, updated_at=NOW() WHERE id=$1`,
    [job.id, attempts, String(error.message || error).slice(0, 1000), delaySeconds]
  );
  await triage.writeAudit({
    clinicId: job.clinic_id, actorType: 'system', actorName: 'FHIR sync worker',
    action: 'fhir_sync_failed', subjectType: 'triage_assessment', subjectId: job.assessment_id,
    payload: { job_id: job.id, attempts, retry_in_seconds: delaySeconds, error: String(error.message || error).slice(0, 500) },
  });
  return { ok: false, status: 'failed', error: String(error.message || error) };
}

async function processPending() {
  if (workerBusy) return { ok: true, status: 'worker_busy' };
  workerBusy = true;
  let job = null;
  try {
    job = await claimJob();
    if (!job) return { ok: true, status: 'idle' };
    return await processJob(job);
  } catch (error) {
    if (job) return failJob(job, error);
    return { ok: false, status: 'failed', error: error.message };
  } finally {
    workerBusy = false;
  }
}

function startWorker() {
  if (!baseUrl() || workerTimer) return;
  const interval = Math.max(5_000, Number(process.env.FHIR_SYNC_INTERVAL_MS) || 15_000);
  workerTimer = setInterval(() => { processPending().catch((error) => console.warn('[fhir] worker:', error.message)); }, interval);
  workerTimer.unref();
  setTimeout(() => { processPending().catch((error) => console.warn('[fhir] startup:', error.message)); }, 1_000).unref();
  console.log(`[fhir] sync worker enabled for ${baseUrl()}`);
}

function stopWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}

module.exports = {
  loadPacket, buildBundle, enqueueSync, getSyncStatus, processPending, startWorker, stopWorker,
};
