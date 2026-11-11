'use strict';

const express = require('express');
const db = require('../db');
const { authenticate, authorizeClinic } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const triage = require('../models/triage');
const mcp = require('../mcp/triageClient');
const agentService = require('../services/agent');

const router = express.Router();
const URGENCY = ['low', 'medium', 'high', 'critical'];

function validUrgency(value) {
  return URGENCY.includes(value) ? value : null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
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

function packetHtml(packet) {
  const a = packet.assessment;
  const v = packet.latest_vitals || {};
  const d = packet.clinician_decision;
  const vitalRows = [
    ['Respiratory rate', v.respiratory_rate, 'breaths/min'], ['Heart rate', v.heart_rate, 'beats/min'],
    ['Blood pressure', v.systolic_bp && v.diastolic_bp ? `${v.systolic_bp}/${v.diastolic_bp}` : null, 'mmHg'],
    ['Temperature', v.temperature_c, '°C'], ['SpO₂', v.spo2, '%'], ['AVPU', v.avpu, ''],
  ].filter(([, value]) => value != null);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Nuktas handoff ${escapeHtml(a.id)}</title>
  <style>body{font-family:Inter,Arial,sans-serif;color:#172033;max-width:900px;margin:40px auto;padding:0 24px}h1{margin-bottom:4px}.muted{color:#667085}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{border:1px solid #dfe3ea;border-radius:12px;padding:16px;margin:16px 0}.pill{display:inline-block;background:#e8f1ff;color:#174ea6;border-radius:999px;padding:5px 10px;font-weight:700}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #eee}footer{margin-top:28px;font-size:12px;color:#667085}@media print{body{margin:0}.no-print{display:none}}</style></head><body>
  <button class="no-print" onclick="window.print()">Print / Save PDF</button><h1>Nuktas triage handoff</h1>
  <p class="muted">${escapeHtml(packet.clinic?.name)} · generated ${escapeHtml(packet.generated_at)}</p>
  <div class="card"><div class="grid"><div><strong>Patient</strong><br>${escapeHtml(packet.patient?.name)}</div><div><strong>Queue</strong><br>${escapeHtml(packet.queue_entry?.queue_number)}</div></div></div>
  <div class="card"><span class="pill">SATS ${escapeHtml(a.sats_colour)} · ${escapeHtml(a.recommended_urgency)}</span><h2>Evidence and rationale</h2><p>${escapeHtml(a.rationale)}</p><p><strong>TEWS:</strong> ${escapeHtml(a.tews_score)} · <strong>Target:</strong> ${escapeHtml(a.target_minutes)} minutes · <strong>Confidence:</strong> ${escapeHtml(a.confidence)}</p><p><strong>Missing:</strong> ${escapeHtml((a.missing_data || []).join(', ') || 'None recorded')}</p></div>
  <div class="card"><h2>Latest observations</h2><table>${vitalRows.map(([name,value,unit]) => `<tr><td>${escapeHtml(name)}</td><td><strong>${escapeHtml(value)} ${escapeHtml(unit)}</strong></td></tr>`).join('')}</table></div>
  <div class="card"><h2>Clinician gate</h2>${d ? `<p><strong>${escapeHtml(d.decision)}</strong> by ${escapeHtml(d.clinician_name)} (${escapeHtml(d.clinician_role)})</p><p>Selected urgency: ${escapeHtml(d.selected_urgency || 'not recorded')} · Reason: ${escapeHtml(d.reason || 'not recorded')}</p><p>${escapeHtml(d.note)}</p>` : '<p>Awaiting named clinician decision. Queue unchanged.</p>'}</div>
  <footer>Assessment ${escapeHtml(a.id)} · ${escapeHtml(packet.disclaimer)}</footer></body></html>`;
}

function fhirBundle(packet) {
  const a = packet.assessment; const v = packet.latest_vitals || {}; const d = packet.clinician_decision;
  const patientRef = `Patient/${a.patient_id}`; const encounterId = a.queue_entry_id || a.id;
  const observations = [
    ['respiratory-rate', 'Respiratory rate', v.respiratory_rate, '/min'],
    ['heart-rate', 'Heart rate', v.heart_rate, '/min'],
    ['systolic-bp', 'Systolic blood pressure', v.systolic_bp, 'mm[Hg]'],
    ['diastolic-bp', 'Diastolic blood pressure', v.diastolic_bp, 'mm[Hg]'],
    ['body-temperature', 'Body temperature', v.temperature_c, 'Cel'],
    ['oxygen-saturation', 'Oxygen saturation', v.spo2, '%'],
  ].filter(([, , value]) => value != null).map(([code, display, value, unit]) => ({
    resource: { resourceType: 'Observation', id: `${v.id || a.id}-${code}`, status: 'final',
      code: { text: display }, subject: { reference: patientRef }, encounter: { reference: `Encounter/${encounterId}` },
      effectiveDateTime: v.recorded_at || a.inserted_at, valueQuantity: { value: Number(value), unit } },
  }));
  const entries = [
    { resource: { resourceType: 'Patient', id: a.patient_id, name: [{ text: packet.patient?.name || 'Unknown' }] } },
    { resource: { resourceType: 'Encounter', id: encounterId, status: packet.queue_entry?.status === 'completed' ? 'finished' : 'in-progress', class: { code: 'AMB', display: 'ambulatory' }, subject: { reference: patientRef } } },
    ...observations,
    { resource: { resourceType: 'RiskAssessment', id: a.id, status: d ? 'final' : 'preliminary', subject: { reference: patientRef }, encounter: { reference: `Encounter/${encounterId}` }, occurrenceDateTime: a.inserted_at,
      method: { text: `${a.scale || 'SATS'} ${a.scale_version || ''}`.trim() }, prediction: [{ outcome: { text: `${a.sats_colour} / ${a.recommended_urgency}` }, rationale: a.rationale }],
      note: [{ text: packet.disclaimer }] } },
  ];
  if (a.recommended_department) entries.push({ resource: { resourceType: 'ServiceRequest', id: `route-${a.id}`, status: d?.decision === 'approved' ? 'active' : 'draft', intent: 'order', subject: { reference: patientRef }, encounter: { reference: `Encounter/${encounterId}` }, code: { text: `Route to ${a.recommended_department}` }, requester: d ? { display: d.clinician_name } : { display: 'Nuktas recommendation pending clinician review' } } });
  entries.push({ resource: { resourceType: 'Provenance', id: `provenance-${a.id}`, recorded: packet.generated_at, target: [{ reference: `RiskAssessment/${a.id}` }], agent: [{ type: { text: 'author' }, who: { display: 'Nuktas governed triage agent' } }, ...(d ? [{ type: { text: 'verifier' }, who: { display: d.clinician_name } }] : [])] } });
  return { resourceType: 'Bundle', type: 'collection', timestamp: packet.generated_at, meta: { tag: [{ code: packet.synthetic ? 'synthetic' : 'clinical-record' }] }, entry: entries };
}

router.post('/clinics/:clinic_id/showcase/busy-morning', authenticate, authorizeClinic, asyncHandler(async (req, res) => {
  if (!['admin', 'doctor'].includes(req.user.role)) return res.status(403).json({ error: 'Admin or clinician role required' });
  const clinicId = req.params.clinic_id; const stamp = Date.now(); const client = await db.getClient();
  let patient; let queueEntry; let complaint = 'Chest tightness, dizziness and worsening shortness of breath while waiting';
  try {
    await client.query('BEGIN');
    const dept = (await client.query(`SELECT id FROM departments WHERE clinic_id = $1 ORDER BY is_emergency DESC, name LIMIT 1`, [clinicId])).rows[0];
    if (!dept) throw new Error('Clinic has no department');
    patient = (await client.query(`INSERT INTO patients (phone_number,name,chronic_conditions,preferred_language,consent_given,age_years,sex) VALUES ($1,$2,$3,'en',true,67,'female') RETURNING *`, [`+25470099${String(stamp).slice(-4)}`, `Miriam Demo ${String(stamp).slice(-4)}`, ['hypertension']])).rows[0];
    const call = (await client.query(`INSERT INTO calls (patient_id,clinic_id,language_code,chief_complaint,symptoms,urgency_tier,recommended_department,consent_given,call_status,agent_summary) VALUES ($1,$2,'en',$3,$4,'medium','Emergency',true,'completed',$5) RETURNING *`, [patient.id, clinicId, complaint, ['chest tightness','dizziness','shortness of breath'], 'Synthetic busy-morning deterioration scenario.'])).rows[0];
    queueEntry = (await client.query(`INSERT INTO queue_entries (call_id,clinic_id,department_id,patient_id,queue_number,urgency_tier,position_in_queue,status,estimated_wait_time,notes) VALUES ($1,$2,$3,$4,$5,'medium',99,'waiting',90,'Synthetic finalist showcase') RETURNING *`, [call.id, clinicId, dept.id, patient.id, `DEMO-${String(stamp).slice(-6)}`])).rows[0];
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }

  const actor = { type: 'user', id: req.user.id, name: req.user.name };
  const baseline = await mcp.callTool('record_vitals', { clinic_id: clinicId, patient_id: patient.id, queue_entry_id: queueEntry.id, source: 'staff_entry', actor, vitals: { respiratory_rate: 18, heart_rate: 88, systolic_bp: 132, diastolic_bp: 80, temperature_c: 36.8, spo2: 97, avpu: 'alert', mobility: 'walking', age_years: 67, notes: 'Synthetic baseline observations before deterioration' } });
  const rejected = await mcp.callTool('record_vitals', { clinic_id: clinicId, patient_id: patient.id, queue_entry_id: queueEntry.id, source: 'staff_entry', actor, vitals: { heart_rate: 420, spo2: 8, notes: 'Deliberately invalid synthetic reading' } });
  const corrected = await mcp.callTool('record_vitals', { clinic_id: clinicId, patient_id: patient.id, queue_entry_id: queueEntry.id, source: 'staff_entry', actor, vitals: { respiratory_rate: 32, heart_rate: 122, systolic_bp: 88, diastolic_bp: 61, temperature_c: 37.2, spo2: 89, avpu: 'alert', mobility: 'with_help', age_years: 67, notes: 'Corrected synthetic deterioration observations' } });
  const run = await triage.createAgentRun({ clinicId, patientId: patient.id, queueEntryId: queueEntry.id, trigger: 'busy_morning_demo', language: 'en', input: { chief_complaint: complaint, synthetic: true, invalid_measurement_rejected: !rejected.ok } });
  await triage.writeAudit({ clinicId, actorType: 'user', actorId: req.user.id, actorName: req.user.name, action: 'busy_morning_scenario_started', subjectType: 'agent_run', subjectId: run.id, runId: run.id, payload: { patient_id: patient.id, queue_entry_id: queueEntry.id, baseline_vitals_recorded: baseline.ok, invalid_measurement_rejected: !rejected.ok, corrected_vitals_recorded: corrected.ok } });
  try { await agentService.startRun({ run_id: run.id, clinic_id: clinicId, patient_id: patient.id, queue_entry_id: queueEntry.id, chief_complaint: complaint, language: 'en', trigger: 'busy_morning_demo' }); }
  catch (error) { await triage.updateAgentRun(run.id, { status: 'failed', error: error.message, finished: true }); return res.status(502).json({ error: error.message, run_id: run.id }); }
  res.status(202).json({ ok: true, synthetic: true, run_id: run.id, patient_id: patient.id, queue_entry_id: queueEntry.id, baseline_vitals_recorded: baseline.ok, invalid_measurement_rejected: !rejected.ok, corrected_vitals_recorded: corrected.ok });
}));

router.get('/clinics/:clinic_id/showcase/deterioration-watch', authenticate, authorizeClinic, asyncHandler(async (req, res) => {
  const { rows } = await db.query(`WITH latest_assessment AS (SELECT DISTINCT ON (patient_id) * FROM triage_assessments WHERE clinic_id=$1 ORDER BY patient_id, inserted_at DESC)
    SELECT qe.id AS queue_entry_id, qe.queue_number, qe.status, p.id AS patient_id, p.name AS patient_name,
      a.id AS assessment_id, a.recommended_urgency, a.sats_colour, a.target_minutes, a.rationale, a.inserted_at AS assessed_at,
      a.inserted_at + make_interval(mins => COALESCE(a.target_minutes,60)) AS recheck_due_at,
      EXTRACT(EPOCH FROM ((a.inserted_at + make_interval(mins => COALESCE(a.target_minutes,60))) - NOW()))::int AS seconds_until_due,
      jsonb_build_object('respiratory_rate',v.respiratory_rate,'heart_rate',v.heart_rate,'systolic_bp',v.systolic_bp,'temperature_c',v.temperature_c,'spo2',v.spo2,'recorded_at',v.recorded_at) AS latest_vitals,
      CASE WHEN pv.id IS NULL THEN NULL ELSE jsonb_build_object('respiratory_rate',pv.respiratory_rate,'heart_rate',pv.heart_rate,'systolic_bp',pv.systolic_bp,'temperature_c',pv.temperature_c,'spo2',pv.spo2,'recorded_at',pv.recorded_at) END AS previous_vitals
    FROM queue_entries qe JOIN patients p ON p.id=qe.patient_id JOIN latest_assessment a ON a.patient_id=p.id
    LEFT JOIN LATERAL (SELECT * FROM vitals WHERE clinic_id=$1 AND patient_id=p.id ORDER BY recorded_at DESC LIMIT 1) v ON true
    LEFT JOIN LATERAL (SELECT * FROM vitals WHERE clinic_id=$1 AND patient_id=p.id ORDER BY recorded_at DESC OFFSET 1 LIMIT 1) pv ON true
    WHERE qe.clinic_id=$1 AND qe.status IN ('waiting','checked_in','in_progress')
      AND v.id IS NOT NULL
      AND (p.phone_number NOT LIKE '+25470099%' OR pv.id IS NOT NULL)
    ORDER BY seconds_until_due ASC LIMIT 25`, [req.params.clinic_id]);
  res.json({ synthetic_may_be_present: true, watch: rows.map((row) => ({ ...row, state: row.seconds_until_due <= 0 ? 'overdue' : row.seconds_until_due <= 300 ? 'due_soon' : 'monitoring' })) });
}));

router.get('/clinics/:clinic_id/showcase/metrics', authenticate, authorizeClinic, asyncHandler(async (req, res) => {
  const clinicId = req.params.clinic_id;
  const [decisionResult, runResult, recentResult] = await Promise.all([
    db.query(`SELECT COUNT(*) FILTER (WHERE decided_at IS NOT NULL AND clinician_urgency IS NOT NULL)::int AS decisions,
      COUNT(*) FILTER (WHERE decided_at IS NOT NULL AND clinician_urgency=recommended_urgency)::int AS agreements,
      COUNT(*) FILTER (WHERE decided_at IS NOT NULL AND clinician_urgency IS NOT NULL AND CASE clinician_urgency WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END > CASE recommended_urgency WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END)::int AS under_triage,
      COUNT(*) FILTER (WHERE decided_at IS NOT NULL AND clinician_urgency IS NOT NULL AND CASE clinician_urgency WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END < CASE recommended_urgency WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END)::int AS over_triage,
      ROUND(AVG(EXTRACT(EPOCH FROM (decided_at-inserted_at))) FILTER (WHERE decided_at IS NOT NULL AND clinician_urgency IS NOT NULL))::int AS avg_decision_seconds FROM triage_assessments WHERE clinic_id=$1`, [clinicId]),
    db.query(`SELECT COUNT(*)::int AS runs, ROUND(AVG(duration_ms))::int AS avg_duration_ms, ROUND(AVG(tokens_in+tokens_out))::int AS avg_tokens, COUNT(*) FILTER (WHERE status='failed')::int AS failed_runs FROM agent_runs WHERE clinic_id=$1`, [clinicId]),
    db.query(`SELECT id, patient_id, recommended_urgency, clinician_urgency, status, decided_by_name, decided_at FROM triage_assessments WHERE clinic_id=$1 AND decided_at IS NOT NULL AND clinician_urgency IS NOT NULL ORDER BY decided_at DESC LIMIT 8`, [clinicId]),
  ]);
  const decisions = decisionResult.rows[0]; const runs = runResult.rows[0]; const perMillion = Number(process.env.MODEL_COST_PER_1M_TOKENS || 0);
  res.json({ synthetic_or_demo_metrics: true, decisions: { ...decisions, agreement_rate: decisions.decisions ? Math.round((decisions.agreements / decisions.decisions) * 100) : null }, runs, estimated_cost_per_run_usd: perMillion && runs.avg_tokens ? Number(((runs.avg_tokens / 1_000_000) * perMillion).toFixed(6)) : null, cost_note: perMillion ? 'Configured model token estimate.' : 'Self-hosted model cost not configured; set MODEL_COST_PER_1M_TOKENS.', recent_decisions: recentResult.rows });
}));

router.get('/clinics/:clinic_id/recommendations/:id/handoff', authenticate, authorizeClinic, asyncHandler(async (req, res) => {
  const packet = await loadPacket(req.params.clinic_id, req.params.id); if (!packet) return res.status(404).json({ error: 'Assessment not found' });
  if (req.query.format === 'html') return res.type('html').send(packetHtml(packet));
  res.json(packet);
}));

router.get('/clinics/:clinic_id/recommendations/:id/fhir', authenticate, authorizeClinic, asyncHandler(async (req, res) => {
  const packet = await loadPacket(req.params.clinic_id, req.params.id); if (!packet) return res.status(404).json({ error: 'Assessment not found' });
  res.type('application/fhir+json').send(fhirBundle(packet));
}));

module.exports = router;
