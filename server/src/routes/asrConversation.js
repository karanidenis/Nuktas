const express = require('express');

const { authenticate } = require('../middleware/auth');
const clinics = require('../models/clinics');
const patients = require('../models/patients');
const queue = require('../models/queue');
const sessions = require('../voice/callSession');
const openai = require('../services/openai');
const { asyncHandler } = require('../utils/asyncHandler');
const db = require('../db');

const router = express.Router();

router.use(authenticate);

const ASR_BASE_URL = (process.env.ASR_BASE_URL || 'http://localhost:8001').replace(/\/$/, '');
const TTS_BASE_URL = (process.env.TTS_BASE_URL || 'http://localhost:8002').replace(/\/$/, '');

const greetings = {
  sw: 'Habari. Ni tatizo gani la afya linakuleta leo?',
  en: 'Hello. What health concern brings you in today?',
};

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

async function ensureSession(sessionId, clinicId, patient) {
  const session = sessions.getOrCreate(sessionId);
  if (!session.messages.length) {
    session.patient = patient;
    session.clinicId = clinicId;
    session.language = patient.preferred_language || 'sw';
    const systemPrompt = openai.buildIntakeSystemPrompt(patient.chronic_conditions ?? [], []);
    session.messages = [{ role: 'system', content: systemPrompt }];
  }
  return session;
}

async function getTtsAudio(text) {
  if (!TTS_BASE_URL || !text) return null;
  try {
    const response = await fetch(`${TTS_BASE_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('TTS error:', err.message);
    return null;
  }
}

router.post('/asr/conversation/start', asyncHandler(async (req, res) => {
  const clinicId = req.get('x-clinic-id') || req.body?.clinic_id || req.user.clinic_id;
  if (!clinicId) return res.status(400).json({ error: 'clinic_id is required' });

  const rawPhone = req.get('x-patient-phone') || req.body?.phone || req.user.phone_number || 'unknown';
  const patientPhone = typeof rawPhone === 'string' ? rawPhone.replace(/\s+/g, '') : 'unknown';

  const patient = await patients.findOrCreate(patientPhone);
  const clinic = await clinics.getClinic(clinicId);
  if (!clinic) return res.status(404).json({ error: 'Clinic not found' });

  const sessionId = `asr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = await ensureSession(sessionId, clinicId, patient);

  const greeting = greetings[session.language] ?? greetings.en;
  session.messages.push({ role: 'assistant', content: greeting });

  const tts = await getTtsAudio(greeting);

  res.json({ session_id: sessionId, reply: greeting, language: session.language, tts });
}));

router.post('/asr/conversation/turn', asyncHandler(async (req, res) => {
  if (!req.is('application/octet-stream')) {
    return res.status(400).json({ error: 'Expected application/octet-stream audio' });
  }

  const sessionId = req.get('x-session-id') || req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: 'session_id is required' });

  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

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
  if (transcript) session.messages.push({ role: 'user', content: transcript });

  let responseText = '';
  try {
    responseText = await openai.chat(session.messages, { temperature: 0.3, maxTokens: 500 });
    session.messages.push({ role: 'assistant', content: responseText });
  } catch (err) {
    console.error('ASR conversation AI error:', err.message);
    responseText = 'I see. Could you tell me a bit more about how you feel?';
  }

  const intakeResult = openai.parseIntakeResult(responseText);
  const reply = responseText.replace(/<INTAKE_COMPLETE>[\s\S]*$/m, '').trim();

  const tts = await getTtsAudio(reply);

  res.json({ transcript, reply, intake_complete: !!intakeResult, tts });
}));

router.post('/asr/conversation/complete', asyncHandler(async (req, res) => {
  const { session_id, clinic_id, phone } = req.body || {};
  if (!session_id) return res.status(400).json({ error: 'session_id is required' });

  const session = sessions.get(session_id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const clinicId = clinic_id || session.clinicId || req.user.clinic_id;
  if (!clinicId) return res.status(400).json({ error: 'clinic_id is required' });

  const rawPhone = phone || session.patient?.phone_number || 'unknown';
  const patientPhone = typeof rawPhone === 'string' ? rawPhone.replace(/\s+/g, '') : 'unknown';

  const patient = await patients.findOrCreate(patientPhone);
  const clinic = await clinics.getClinic(clinicId);
  if (!clinic) return res.status(404).json({ error: 'Clinic not found' });

  const lastAssistant = [...session.messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  const parsed = openai.parseIntakeResult(lastAssistant);
  const intakeResult = parsed || buildMinimalIntakeResult(lastAssistant);

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

  const { rows: callRows } = await db.query(
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
      session.language || patient.preferred_language || 'sw',
      session.messages
        .filter((m) => m.role !== 'system')
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n'),
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

  sessions.destroy(session_id);

  const farewells = {
    sw: `Asante. Namba yako ya kusubiri ni ${queueNum}. Tafadhali subiri.`,
    en: `Thank you. Your queue number is ${queueNum}. Please take a seat.`,
  };
  const farewell = farewells[session.language] ?? farewells.en;
  const tts = await getTtsAudio(farewell);

  res.json({ queue_entry: entry, intake: intakeResult, estimated_wait_time: estimatedWait, reply: farewell, tts });
}));

module.exports = router;
