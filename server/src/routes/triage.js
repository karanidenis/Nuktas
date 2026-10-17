'use strict';

/**
 * Nuktas triage routes.
 *
 * Two audiences share this router:
 *
 *  • Nurses/clinicians (JWT, clinic-scoped). They read the agent's pending
 *    recommendations, and they are the only ones who can approve or reject one.
 *    Approving writes a named approval row and then asks the MCP server to apply
 *    it — the API itself never writes queue SQL, so there is exactly one gated
 *    path to a queue change.
 *
 *  • The agent worker (shared service token). It opens a run, streams steps into
 *    it, and closes it. It cannot approve anything.
 */

const express = require('express');
const {
  authenticate,
  authorizeClinic,
  requireServiceToken,
} = require('../middleware/auth');
const triage = require('../models/triage');
const mcp = require('../mcp/triageClient');
const agentService = require('../services/agent');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const TERMINAL_ASSESSMENT = ['applied', 'superseded'];

function emit(io, clinicId, event, payload) {
  if (io) io.to(`clinic:${clinicId}`).emit(event, payload);
}

// ── Read: the review queue ────────────────────────────────────────────────────

// GET /api/v1/clinics/:clinic_id/recommendations?status=pending,awaiting_approval
router.get(
  '/clinics/:clinic_id/recommendations',
  authenticate,
  authorizeClinic,
  asyncHandler(async (req, res) => {
    const { clinic_id } = req.params;
    const statuses = req.query.status
      ? String(req.query.status)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : triage.OPEN_STATUSES;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const recommendations = await triage.listRecommendations(clinic_id, statuses, limit);
    res.json({ clinic_id, statuses, recommendations });
  })
);

// GET /api/v1/clinics/:clinic_id/recommendations/:id
router.get(
  '/clinics/:clinic_id/recommendations/:id',
  authenticate,
  authorizeClinic,
  asyncHandler(async (req, res) => {
    const assessment = await triage.getAssessment(req.params.id, req.params.clinic_id);
    if (!assessment) return res.status(404).json({ error: 'Recommendation not found' });
    const approval = await triage.getApprovalForAssessment(req.params.id);
    res.json({ recommendation: assessment, approval });
  })
);

// ── Approve / reject — the clinician gate ─────────────────────────────────────

// POST /api/v1/clinics/:clinic_id/recommendations/:id/approve
router.post(
  '/clinics/:clinic_id/recommendations/:id/approve',
  authenticate,
  authorizeClinic,
  asyncHandler(async (req, res) => {
    const { clinic_id, id } = req.params;
    const note = req.body?.note ?? null;

    const assessment = await triage.getAssessment(id, clinic_id);
    if (!assessment) return res.status(404).json({ error: 'Recommendation not found' });
    if (TERMINAL_ASSESSMENT.includes(assessment.status)) {
      return res.status(409).json({
        error: `Recommendation is already ${assessment.status}`,
        status: assessment.status,
      });
    }

    // 1. Record the named approval — this is the gate record the MCP tool checks.
    const approval = await triage.upsertApproval({
      assessmentId: id,
      clinicId: clinic_id,
      decision: 'approved',
      decidedBy: req.user.id,
      decidedByName: req.user.name,
      role: req.user.role,
      note,
    });
    await triage.setAssessmentStatus(id, 'approved', {
      decidedBy: req.user.id,
      decidedByName: req.user.name,
      decisionNote: note,
      markDecided: true,
    });
    await triage.writeAudit({
      clinicId: clinic_id,
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.name,
      action: 'clinician_approved',
      subjectType: 'triage_assessment',
      subjectId: id,
      payload: {
        approval_id: approval.id,
        recommended_urgency: assessment.recommended_urgency,
        sats_colour: assessment.sats_colour,
        queue_entry_id: assessment.queue_entry_id,
        note,
      },
    });

    // 2. Ask the MCP server to apply it. The API does not touch the queue itself.
    const result = await applyViaMcp({
      clinicId: clinic_id,
      assessmentId: id,
      approvalId: approval.id,
      user: req.user,
      io: req.app.get('io'),
    });

    if (!result.ok) {
      // The approval stands, but the queue is unchanged. Surface a retryable error.
      return res.status(502).json({
        error: result.error,
        approval_id: approval.id,
        retry: `/api/v1/clinics/${clinic_id}/recommendations/${id}/apply`,
      });
    }

    emit(req.app.get('io'), clinic_id, 'recommendation_updated', {
      assessment_id: id,
      status: 'applied',
      approved_by: req.user.name,
      applied: result.applied,
    });
    res.json({ success: true, approval_id: approval.id, applied: result.applied });
  })
);

// POST /api/v1/clinics/:clinic_id/recommendations/:id/reject
router.post(
  '/clinics/:clinic_id/recommendations/:id/reject',
  authenticate,
  authorizeClinic,
  asyncHandler(async (req, res) => {
    const { clinic_id, id } = req.params;
    const note = req.body?.note ?? null;

    const assessment = await triage.getAssessment(id, clinic_id);
    if (!assessment) return res.status(404).json({ error: 'Recommendation not found' });
    if (TERMINAL_ASSESSMENT.includes(assessment.status)) {
      return res.status(409).json({ error: `Recommendation is already ${assessment.status}` });
    }

    const approval = await triage.upsertApproval({
      assessmentId: id,
      clinicId: clinic_id,
      decision: 'rejected',
      decidedBy: req.user.id,
      decidedByName: req.user.name,
      role: req.user.role,
      note,
    });
    await triage.setAssessmentStatus(id, 'rejected', {
      decidedBy: req.user.id,
      decidedByName: req.user.name,
      decisionNote: note,
      markDecided: true,
    });
    await triage.writeAudit({
      clinicId: clinic_id,
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.name,
      action: 'clinician_rejected',
      subjectType: 'triage_assessment',
      subjectId: id,
      payload: {
        approval_id: approval.id,
        recommended_urgency: assessment.recommended_urgency,
        note,
      },
    });

    emit(req.app.get('io'), clinic_id, 'recommendation_updated', {
      assessment_id: id,
      status: 'rejected',
      rejected_by: req.user.name,
    });
    res.json({ success: true, approval_id: approval.id, status: 'rejected' });
  })
);

// POST /api/v1/clinics/:clinic_id/recommendations/:id/apply
// Retry applying an already-approved recommendation (e.g. MCP was briefly down).
router.post(
  '/clinics/:clinic_id/recommendations/:id/apply',
  authenticate,
  authorizeClinic,
  asyncHandler(async (req, res) => {
    const { clinic_id, id } = req.params;
    const approval = await triage.getApprovalForAssessment(id);
    if (!approval || approval.decision !== 'approved') {
      return res.status(409).json({ error: 'No approved clinician decision to apply' });
    }
    const result = await applyViaMcp({
      clinicId: clinic_id,
      assessmentId: id,
      approvalId: approval.id,
      user: req.user,
      io: req.app.get('io'),
    });
    if (!result.ok) return res.status(502).json({ error: result.error });
    res.json({ success: true, applied: result.applied });
  })
);

/**
 * Shared apply path: call the MCP tool and audit the outcome. Returns
 * `{ ok, applied?, error? }` and never throws.
 */
async function applyViaMcp({ clinicId, assessmentId, approvalId, user, io }) {
  let ok = false;
  let applied = null;
  let error = null;
  try {
    const r = await mcp.callTool('apply_approved_queue_update', {
      clinic_id: clinicId,
      assessment_id: assessmentId,
      approval_id: approvalId,
      actor: { type: 'user', id: user.id, name: user.name },
    });
    ok = r.ok;
    applied = r.data;
    if (!ok) error = r.data?.error || 'MCP refused to apply the update';
  } catch (err) {
    error = `MCP server unreachable: ${err.message}`;
  }

  await triage.writeAudit({
    clinicId,
    actorType: ok ? 'mcp' : 'system',
    actorId: user?.id ?? null,
    actorName: user?.name ?? null,
    action: ok ? 'queue_update_applied' : 'queue_update_failed',
    subjectType: 'triage_assessment',
    subjectId: assessmentId,
    payload: { approval_id: approvalId, ok, applied, error },
  });

  if (!ok) emit(io, clinicId, 'queue_update_failed', { assessment_id: assessmentId, error });
  return { ok, applied, error };
}

// ── Read: governance views ────────────────────────────────────────────────────

// GET /api/v1/clinics/:clinic_id/audit?run_id=...&limit=...
router.get(
  '/clinics/:clinic_id/audit',
  authenticate,
  authorizeClinic,
  asyncHandler(async (req, res) => {
    const events = await triage.listAudit(req.params.clinic_id, {
      runId: req.query.run_id || null,
      limit: Number(req.query.limit) || 100,
    });
    res.json({ clinic_id: req.params.clinic_id, events });
  })
);

// GET /api/v1/clinics/:clinic_id/agent-runs
router.get(
  '/clinics/:clinic_id/agent-runs',
  authenticate,
  authorizeClinic,
  asyncHandler(async (req, res) => {
    const runs = await triage.listAgentRuns(req.params.clinic_id, Number(req.query.limit) || 25);
    res.json({ clinic_id: req.params.clinic_id, runs });
  })
);

// GET /api/v1/clinics/:clinic_id/agent-runs/:id
router.get(
  '/clinics/:clinic_id/agent-runs/:id',
  authenticate,
  authorizeClinic,
  asyncHandler(async (req, res) => {
    const run = await triage.getAgentRun(req.params.id);
    if (!run || run.clinic_id !== req.params.clinic_id) {
      return res.status(404).json({ error: 'Agent run not found' });
    }
    res.json({ run });
  })
);

// ── Trigger: start a triage run ───────────────────────────────────────────────

// POST /api/v1/clinics/:clinic_id/triage/runs
// The dashboard asks the worker to triage a patient. We record the run first so
// there is always a row, even if the worker is unreachable.
router.post(
  '/clinics/:clinic_id/triage/runs',
  authenticate,
  authorizeClinic,
  asyncHandler(async (req, res) => {
    const { clinic_id } = req.params;
    const { patient_id, queue_entry_id, chief_complaint, language, trigger } = req.body || {};
    if (!patient_id) return res.status(400).json({ error: 'patient_id is required' });

    const run = await triage.createAgentRun({
      clinicId: clinic_id,
      patientId: patient_id,
      queueEntryId: queue_entry_id || null,
      trigger: trigger || 'dashboard',
      language: language || 'en',
      model: null,
      provider: null,
      input: { chief_complaint: chief_complaint || null },
    });

    try {
      await agentService.startRun({
        run_id: run.id,
        clinic_id,
        patient_id,
        queue_entry_id: queue_entry_id || null,
        chief_complaint: chief_complaint || null,
        language: language || 'en',
        trigger: trigger || 'dashboard',
      });
    } catch (err) {
      await triage.updateAgentRun(run.id, {
        status: 'failed',
        error: err.message,
        finished: true,
      });
      await triage.writeAudit({
        clinicId: clinic_id,
        actorType: 'user',
        actorId: req.user.id,
        actorName: req.user.name,
        action: 'agent_run_failed_to_start',
        subjectType: 'agent_run',
        subjectId: run.id,
        payload: { error: err.message },
      });
      return res.status(502).json({ error: `Could not start agent: ${err.message}`, run_id: run.id });
    }

    emit(req.app.get('io'), clinic_id, 'agent_run_started', {
      run_id: run.id,
      patient_id,
      queue_entry_id: queue_entry_id || null,
    });
    res.status(202).json({ run_id: run.id, status: 'running' });
  })
);

// ── Agent worker callbacks (service token) ────────────────────────────────────

// GET /api/v1/agent-runs/:id — the worker fetches its own run context.
router.get(
  '/agent-runs/:id',
  requireServiceToken,
  asyncHandler(async (req, res) => {
    const run = await triage.getAgentRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Agent run not found' });
    res.json({ run });
  })
);

// POST /api/v1/agent-runs — the worker opens a run for voice/asr triggers.
router.post(
  '/agent-runs',
  requireServiceToken,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.clinic_id) return res.status(400).json({ error: 'clinic_id is required' });
    const run = await triage.createAgentRun({
      clinicId: b.clinic_id,
      patientId: b.patient_id || null,
      queueEntryId: b.queue_entry_id || null,
      trigger: b.trigger || 'voice',
      language: b.language || 'en',
      model: b.model || null,
      provider: b.provider || null,
      input: b.input || {},
    });
    res.status(201).json({ run });
  })
);

// PATCH /api/v1/agent-runs/:id — append a step and/or update run fields.
router.patch(
  '/agent-runs/:id',
  requireServiceToken,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const run = await triage.getAgentRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Agent run not found' });

    if (b.step) await triage.appendRunStep(req.params.id, b.step);

    const fields = {};
    for (const k of ['status', 'summary', 'assessment_id', 'error', 'tokens_in', 'tokens_out', 'duration_ms', 'model', 'provider']) {
      if (b[k] !== undefined) fields[k] = b[k];
    }
    if (b.finished) fields.finished = true;
    if (Object.keys(fields).length) await triage.updateAgentRun(req.params.id, fields);

    const updated = await triage.getAgentRun(req.params.id);
    emit(req.app.get('io'), run.clinic_id, 'agent_run_updated', {
      run_id: run.id,
      status: updated.status,
      step: b.step || null,
    });
    res.json({ success: true, run: updated });
  })
);

module.exports = router;
