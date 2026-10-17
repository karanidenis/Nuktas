const express = require('express');

const { authenticate } = require('../middleware/auth');
const clinics = require('../models/clinics');
const patients = require('../models/patients');
const queue = require('../models/queue');
const openai = require('../services/openai');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);

const ASR_BASE_URL = (process.env.ASR_BASE_URL || 'http://localhost:8001').replace(/\/$/, '');

function buildMinimalIntakeResult(transcript) {
  return {
    chief_complaint: transcript?.slice(0, 120) || 'Voice intake (ASR) — no transcript',
    symptoms: [],
    red_flag_detected: false,
    red_flag_details: null,
    urgency_tier: 'medium',
    recommended_department: 'Internal Medicine',
    secondary_departments: [],
    agent_summary: transcript || 'No transcript provided.',
  };
}

router.post('/asr/intake', asyncHandler(async (req, res) => {
  if (!req.is('application/octet-stream')) {
    return res.status(400).json({ error: 'Expected application/octet-stream audio' });
  }

  const clinicId = req.get('x-clinic-id') || req.query.clinic_id || req.user.clinic_id;
  if (!clinicId) return res.status(400).json({ error: 'clinic_id is required' });

  const rawPhone = req.get('x-patient-phone') || req.query.phone || req.user.phone_number || 'unknown';
  const patientPhone = typeof rawPhone === 'string' ? rawPhone.replace(/\s+/g, '') : 'unknown';

  const asrResponse = await fetch(`${ASR_BASE_URL}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: req.body,
  });

  const asrData = await asrResponse.json().catch(() => ({}));
  if (!asrResponse.ok) {
    return res.status(502).json({ error: 'ASR service error', detail: asrData.detail ?? asrData });
  }

  const transcript = (asrData.text || '').trim();
  const detectedLanguage = asrData.language || null;

  const patient = await patients.findOrCreate(patientPhone);
  const clinic = await clinics.getClinic(clinicId);
  if (!clinic) return res.status(404).json({ error: 'Clinic not found' });

  let intakeResult = buildMinimalIntakeResult(transcript);
  const systemPrompt = openai.buildIntakeSystemPrompt(patient.chronic_conditions ?? [], []);
  const fullTranscript = transcript ? `Patient transcript:\n${transcript}` : 'Patient transcript: [empty]';

  try {
    const prompt = `${systemPrompt}\n\n${fullTranscript}\n\nRespond with 2 parts:\n1) A brief conversational reply to the patient (1-2 sentences).\n2) Then the <INTAKE_COMPLETE> JSON block.`;
    const responseText = await openai.chat(
      [
        { role: 'system', content: 'You are a medical intake assistant. Provide a patient reply then the JSON block.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.2, maxTokens: 600 }
    );

    const parsed = openai.parseIntakeResult(responseText);
    if (parsed) intakeResult = parsed;

    const reply = responseText.replace(/<INTAKE_COMPLETE>[\s\S]*$/m, '').trim();
    intakeResult._assistant_reply = reply || null;
  } catch (err) {
    console.error('ASR intake AI error:', err.message);
  }

  let department = null;
  if (intakeResult.recommended_department) {
    department = await clinics.getDepartmentByName(clinicId, intakeResult.recommended_department);
  }
  if (!department) {
    const depts = await clinics.getDepartmentsWithStats(clinicId);
    department = intakeResult.urgency_tier === 'critical'
      ? depts.find((d) => d.is_emergency) ?? depts[0]
      : depts[0];
  }

  const queueNum = queue.generateQueueNumber(clinic.code, department.code, intakeResult.urgency_tier);
  const waitByTier = { critical: 0, high: 30, medium: 90, low: 180 };
  const estimatedWait = waitByTier[intakeResult.urgency_tier] ?? 60;

  const languageCode = detectedLanguage || patient.preferred_language || 'sw';

  const { rows: callRows } = await require('../db').query(
    `INSERT INTO calls
       (patient_id, clinic_id, language_code, call_transcript, chief_complaint,
        symptoms, red_flag_detected, red_flag_details, urgency_tier,
        recommended_department, secondary_departments, call_status, agent_summary)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'completed',$12)
     RETURNING id`,
    [
      patient.id,
      clinicId,
      languageCode,
      transcript,
      intakeResult.chief_complaint,
      intakeResult.symptoms ?? [],
      intakeResult.red_flag_detected ?? false,
      intakeResult.red_flag_details,
      intakeResult.urgency_tier,
      intakeResult.recommended_department,
      intakeResult.secondary_departments ?? [],
      intakeResult.agent_summary,
    ]
  );

  const entry = await queue.createEntry({
    call_id: callRows[0].id,
    clinic_id: clinicId,
    department_id: department.id,
    patient_id: patient.id,
    queue_number: queueNum,
    urgency_tier: intakeResult.urgency_tier,
    estimated_wait_time: estimatedWait,
  });

  await patients.incrementVisitCount(patient.id);

  const io = req.app.get('io');
  if (io) {
    io.to(`clinic:${clinicId}`).emit('patient_joined', { queue_entry: entry });
    if (intakeResult.urgency_tier === 'critical') {
      io.to(`clinic:${clinicId}`).emit('critical_alert', { queue_entry: entry });
    }
  }

  res.json({
    transcript,
    language: languageCode,
    assistant_reply: intakeResult._assistant_reply ?? null,
    intake: intakeResult,
    queue_entry: entry,
    estimated_wait_time: estimatedWait,
  });
}));

module.exports = router;
