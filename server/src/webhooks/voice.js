const express = require('express');
const db = require('../db');
const patients = require('../models/patients');
const clinics = require('../models/clinics');
const hospitals = require('../models/hospitals');
const queue = require('../models/queue');
const sessions = require('../voice/callSession');
const twiml = require('../services/twilio');
const openai = require('../services/openai');
const sms = require('../services/sms');
const embeddings = require('../services/embeddings');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const BASE_URL = process.env.BASE_URL || process.env.NGROK_URL || `http://127.0.0.1:${process.env.PORT || 4000}`;

// Helper: get local TTS URL (only for Kiswahili, since Amazon Polly has no Swahili voice)
function getTtsUrl(text, lang = 'sw') {
  if (lang !== 'sw') return null; // Only use local TTS for Kiswahili
  const encoded = encodeURIComponent(text);
  // &amp; is required — bare & in XML content is a parse error (Twilio rejects the TwiML)
  return `${BASE_URL}/tts-play/play?text=${encoded}&amp;lang=swh`;
}

// Helper: returns <Play> for Kiswahili (local TTS) or <Say> for English
function audioEl(text, lang) {
  const url = getTtsUrl(text, lang);
  return url ? `<Play>${url}</Play>` : `<Say voice="Polly.Joanna">${text}</Say>`;
}

function twilioLangCode(lang) {
  return { sw: 'sw-KE', en: 'en-US' }[lang] ?? 'en-US';
}

// Twilio's `experimental_conversations` speech model does not support Swahili, so
// only request it for English; the default model (Google STT V2) supports sw-KE.
function speechModelAttr(lang) {
  return lang === 'en' ? ' speechModel="experimental_conversations"' : '';
}

// Helper: send TwiML XML response
function xml(res, body) {
  res.set('Content-Type', 'application/xml');
  res.send(body);
}

// Helper: create or update a call record
async function upsertCall(attrs) {
  if (attrs.id) {
    const sets = Object.entries(attrs)
      .filter(([k]) => k !== 'id')
      .map(([k], i) => `${k} = $${i + 2}`);
    const vals = Object.entries(attrs)
      .filter(([k]) => k !== 'id')
      .map(([, v]) => v);
    await db.query(
      `UPDATE calls SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`,
      [attrs.id, ...vals]
    );
    return attrs.id;
  }
  const { rows } = await db.query(
    `INSERT INTO calls (patient_id, clinic_id, twilio_call_sid, language_code, consent_given, call_status)
     VALUES ($1, $2, $3, $4, $5, 'in_progress')
     RETURNING id`,
    [attrs.patient_id, attrs.clinic_id, attrs.twilio_call_sid, attrs.language_code ?? 'sw', attrs.consent_given ?? false]
  );
  return rows[0].id;
}

// ── POST /webhooks/voice/incoming ─────────────────────────────────────────────
router.post('/incoming', asyncHandler(async (req, res) => {
  console.log('[INCOMING] Called! CallSid:', req.body.CallSid, 'From:', req.body.From);
  const callSid = req.body.CallSid;
  const fromNumber = (req.body.From || req.body.Caller || '').trim();
  console.log('[INCOMING] fromNumber:', fromNumber);

  try {
    const session = sessions.create(callSid);
    const patient = await patients.findOrCreate(fromNumber);
    session.patient = patient;
    session.language = patient.preferred_language || 'sw';
    // Twilio provides city/state derived from the caller's phone number registration
    session.callerCity = req.body.FromCity || req.body.CallerCity || null;

    const clinic = await clinics.getDefaultClinic();
    if (clinic) {
      session.clinicId = clinic.id;
      const callId = await upsertCall({
        patient_id: patient.id,
        clinic_id: clinic.id,
        twilio_call_sid: callSid,
        language_code: session.language,
        consent_given: false,
      });
      session.callId = callId;
    }

    const welcomeMsg = {
      sw: 'Karibu. Bonyeza 1 kwa Kiswahili. Bonyeza 2 kwa Kiingereza.',
      en: 'Welcome. Press 1 for Kiswahili. Press 2 for English.',
    };
    const greeting = welcomeMsg[session.language] ?? welcomeMsg.en;
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf speech" action="/webhooks/voice/language" method="POST" timeout="10" numDigits="1" language="${twilioLangCode(session.language)}">
    ${audioEl(greeting, session.language)}
  </Gather>
  <Redirect method="POST">/webhooks/voice/language_timeout</Redirect>
</Response>`;

  return xml(res, twimlResponse);
  } catch (err) {
    console.error('incoming_call error:', err);
    return xml(res, twiml.sayAndHangup('Sorry, we encountered a technical issue. Please call back later.'));
  }
}));

// ── POST /webhooks/voice/consent ──────────────────────────────────────────────
router.post('/consent', asyncHandler(async (req, res) => {
  console.log('[CONSENT] Called! CallSid:', req.body.CallSid, 'SpeechResult:', req.body.SpeechResult, 'Digits:', req.body.Digits);
  const callSid = req.body.CallSid;
  const session = sessions.get(callSid);
  if (!session) return xml(res, twiml.transferToOperator());
  
  const langText = {
    sw: 'Chagua lugha. 1 Kiswahili. 2 Kiingereza.',
    en: 'Select language. 1 Kiswahili. 2 English.',
  };
  const greeting = langText[session.language] ?? langText.en;

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf speech" action="/webhooks/voice/language" method="POST" timeout="10" numDigits="1">
    ${audioEl(greeting, session.language)}
  </Gather>
  <Redirect>/webhooks/voice/language_timeout</Redirect>
</Response>`;
  return xml(res, twimlResponse);
}));

// ── POST /webhooks/voice/consent_timeout ──────────────────────────────────────
router.post('/consent_timeout', (req, res) => {
  console.log('[CONSENT_TIMEOUT] Called! CallSid:', req.body.CallSid);
  xml(res, twiml.transferToOperator());
});

// ── POST /webhooks/voice/language ─────────────────────────────────────────────
router.post('/language', asyncHandler(async (req, res) => {
  console.log('[LANGUAGE] Called! CallSid:', req.body.CallSid, 'Digits:', req.body.Digits, 'Speech:', req.body.SpeechResult);
  const callSid = req.body.CallSid;
  const digit = req.body.Digits;
  const speech = (req.body.SpeechResult || '').toLowerCase();
  const session = sessions.get(callSid);
  console.log('[LANGUAGE] Session found:', !!session);
  if (!session) return xml(res, twiml.transferToOperator());

  let lang = 'en';
  if (digit === '1' || speech.includes('kiswahili') || speech.includes('swahili')) lang = 'sw';
  else if (digit === '2' || speech.includes('english')) lang = 'en';

  session.language = lang;
  session.state = 'language_select';

  // Update call language
  if (session.callId) {
    await db.query('UPDATE calls SET language_code = $1 WHERE id = $2', [lang, session.callId]);
  }

  const startMsg = {
    sw: 'Asante kwa kuchagua. Sasa utajibu maswali kuhusu afya yako.',
    en: 'Thank you. You will now be asked health questions.',
  };
  const startText = startMsg[session.language] ?? startMsg.en;
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${audioEl(startText, session.language)}
  <Redirect method="POST">/webhooks/voice/intake/start</Redirect>
</Response>`;
  return xml(res, twimlResponse);
}));

// ── POST /webhooks/voice/language_timeout ─────────────────────────────────────
router.post('/language_timeout', asyncHandler(async (req, res) => {
  const session = sessions.get(req.body.CallSid);
  if (session) session.language = 'en';
  const startMsg = 'Defaulting to English. Starting intake.';
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${startMsg}</Say>
  <Redirect method="POST">/webhooks/voice/intake/start</Redirect>
</Response>`;
  return xml(res, twimlResponse);
}));

// ── POST /webhooks/voice/intake/start ─────────────────────────────────────────
router.post('/intake/start', asyncHandler(async (req, res) => {
  console.log('[INTAKE_START] Called! CallSid:', req.body.CallSid);
  const callSid = req.body.CallSid;
  const session = sessions.get(callSid);
  console.log('[INTAKE_START] Session:', session ? 'found' : 'NOT FOUND');
  if (!session) return xml(res, twiml.transferToOperator());

  session.state = 'intake';

  // Build patient context for OpenAI
  const chronicConditions = session.patient?.chronic_conditions ?? [];
  let visitHistory = [];
  if (session.patient) {
    const result = await patients.getPatientWithHistory(session.patient.id);
    visitHistory = result?.calls ?? [];
  }

  const systemPrompt = openai.buildIntakeSystemPrompt(chronicConditions, visitHistory);
  session.messages = [{ role: 'system', content: systemPrompt }];

  const greetings = {
    sw: 'Habari. Ni tatizo gani la afya linakuleta leo?',
    en: 'Hello. What health concern brings you in today?',
  };
  const greeting = greetings[session.language] ?? greetings.en;

  session.messages.push({ role: 'assistant', content: greeting });

  const ttsUrl = getTtsUrl(greeting, session.language);
  const audioEl = ttsUrl ? `<Play>${ttsUrl}</Play>` : `<Say voice="Polly.Joanna">${greeting}</Say>`;
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/webhooks/voice/intake/gather" method="POST" speechTimeout="auto" language="${twilioLangCode(session.language)}"${speechModelAttr(session.language)}>
    ${audioEl}
  </Gather>
  <Redirect method="POST">/webhooks/voice/intake/gather?timeout=true</Redirect>
</Response>`;
  return xml(res, twimlResponse);
}));

// ── POST /webhooks/voice/intake/gather ────────────────────────────────────────
router.post('/intake/gather', asyncHandler(async (req, res) => {
  console.log('[INCOMING] Called! CallSid:', req.body.CallSid, 'Speech:', req.body.SpeechResult, 'Timeout:', req.query.timeout);
  const callSid = req.body.CallSid;
  const speechText = req.body.SpeechResult;
  const isTimeout = req.query.timeout === 'true';
  const session = sessions.get(callSid);
  console.log('[INTAKE_GATHER] Session:', session ? 'found' : 'NOT FOUND');
  if (!session) return xml(res, twiml.transferToOperator());

  if (isTimeout || !speechText) {
    session.turnCount++;
    if (session.turnCount >= 3) {
      return await finaliseIntake(res, session, null);
    }
    const prompt = {
      sw: 'Samahani, sikusikia vizuri. Tafadhali rudia.',
      en: 'Sorry, I did not catch that. Could you please repeat?',
    }[session.language] ?? 'Could you please repeat?';
    
    return xml(res, `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/webhooks/voice/intake/gather" method="POST" speechTimeout="auto" language="${twilioLangCode(session.language)}"${speechModelAttr(session.language)}>
    ${audioEl(prompt, session.language)}
  </Gather>
  <Redirect method="POST">/webhooks/voice/intake/gather?timeout=true</Redirect>
</Response>`);
  }

  session.messages.push({ role: 'user', content: speechText });
  session.turnCount++;

  const MAX_TURNS = 10;
  let responseText;

  try {
    responseText = await openai.chat(session.messages);
    session.messages.push({ role: 'assistant', content: responseText });
    console.log('[AI Response]:', responseText.substring(0, 200));
  } catch (err) {
    console.error('OpenAI error:', err.message);
    responseText = {
      sw: 'Nimekuelewa. Tafadhali niambie zaidi.',
      en: 'I understand. Can you tell me more?',
    }[session.language] ?? 'Can you tell me more?';
    session.messages.push({ role: 'assistant', content: responseText });
  }

  const intakeResult = openai.parseIntakeResult(responseText);
  console.log('[Intake Result]:', intakeResult, 'Turns:', session.turnCount);
  if (intakeResult || session.turnCount >= MAX_TURNS) {
    return await finaliseIntake(res, session, intakeResult);
  }

  const spokenText = responseText.replace(/<INTAKE_COMPLETE>[\s\S]*$/, '').trim();
  const continuePrompt = {
    sw: 'Tafadhali niambie zaidi.',
    en: 'Can you tell me more?',
  }[session.language] ?? 'Can you tell me more?';
  const textToSay = spokenText || continuePrompt;
  const ttsUrl2 = getTtsUrl(textToSay, session.language);
  const audioEl2 = ttsUrl2 ? `<Play>${ttsUrl2}</Play>` : `<Say voice="Polly.Joanna">${textToSay}</Say>`;
  return xml(res, `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/webhooks/voice/intake/gather" method="POST" speechTimeout="auto" language="${twilioLangCode(session.language)}"${speechModelAttr(session.language)}>
    ${audioEl2}
  </Gather>
  <Redirect method="POST">/webhooks/voice/intake/gather?timeout=true</Redirect>
</Response>`);
}));

// ── POST /webhooks/voice/status ───────────────────────────────────────────────
router.post('/status', asyncHandler(async (req, res) => {
  const { CallSid, CallStatus } = req.body;
  const finalStatuses = ['completed', 'busy', 'failed', 'no-answer', 'canceled'];

  if (finalStatuses.includes(CallStatus)) {
    const { rows } = await db.query(
      'SELECT id, duration FROM calls WHERE twilio_call_sid = $1',
      [CallSid]
    );
    if (rows[0]) {
      await db.query(
        `UPDATE calls SET call_status = $1, call_duration = $2, updated_at = NOW() WHERE id = $3`,
        [CallStatus === 'completed' ? 'completed' : 'failed', req.body.CallDuration ?? null, rows[0].id]
      );
    }
    sessions.destroy(CallSid);
  }

  res.sendStatus(204);
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function speechMeansYes(speech) {
  const yesWords = ['yes', 'ndiyo', 'sawa', 'sure', 'ok', 'okay', 'agree', 'accept'];
  return yesWords.some((w) => speech.includes(w));
}

function buildIntakeStartTwiml(session) {
  const msgs = {
    sw: 'Asante kwa kuchagua. Sasa utajibu maswali kuhusu afya yako.',
    en: 'Thank you. You will now be asked some health questions.',
  };
  const msg = msgs[session.language] ?? msgs.en;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${msg}</Say>
  <Redirect method="POST">/webhooks/voice/intake/start</Redirect>
</Response>`;
}

async function finaliseIntake(res, session, intakeResult) {
  const lang = session.language;

  // Use AI result if available, otherwise generate a minimal one
  const result = intakeResult ?? {
    patient_name: null,
    patient_phone: null,
    chief_complaint: 'Voice intake — incomplete',
    symptoms: [],
    red_flag_detected: false,
    red_flag_details: null,
    urgency_tier: 'medium',
    recommended_department: 'Internal Medicine',
    secondary_departments: [],
    agent_summary: 'Intake completed via voice but result was not fully parsed.',
  };

  try {
    // Update patient name if provided, phone already known from call
    if (session.patient) {
      const updates = [];
      const vals = [];
      let idx = 1;
      if (result.patient_name) {
        updates.push(`name = $${idx++}`);
        vals.push(result.patient_name);
      }
      if (updates.length > 0) {
        vals.push(session.patient.id);
        await db.query(
          `UPDATE patients SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
          vals
        );
      }
    }

    // Mark consent given
    if (session.callId) {
      await db.query(
        'UPDATE calls SET consent_given = true, updated_at = NOW() WHERE id = $1',
        [session.callId]
      );
    }

    // Persist intake data on the call record
    if (session.callId) {
      await db.query(
        `UPDATE calls SET
           chief_complaint        = $1,
           symptoms               = $2,
           red_flag_detected      = $3,
           red_flag_details       = $4,
           urgency_tier           = $5,
           recommended_department = $6,
           secondary_departments  = $7,
           agent_summary          = $8,
           call_transcript        = $9,
           call_status            = 'completed',
           updated_at             = NOW()
         WHERE id = $10`,
        [
          result.chief_complaint,
          result.symptoms,
          result.red_flag_detected,
          result.red_flag_details,
          result.urgency_tier,
          result.recommended_department,
          result.secondary_departments ?? [],
          result.agent_summary,
          session.messages
            .filter((m) => m.role !== 'system')
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n'),
          session.callId,
        ]
      );
    }

    // Find or default the department
    let department = null;
    if (session.clinicId && result.recommended_department) {
      department = await clinics.getDepartmentByName(session.clinicId, result.recommended_department);
    }
    if (!department && session.clinicId) {
      const depts = await clinics.getDepartmentsWithStats(session.clinicId);
      // Prefer emergency for critical, otherwise first available
      department = result.urgency_tier === 'critical'
        ? depts.find((d) => d.is_emergency) ?? depts[0]
        : depts[0];
    }

    // Find clinic details for queue number
    const clinic = session.clinicId ? await clinics.getClinic(session.clinicId) : null;
    const queueNum = clinic && department
      ? queue.generateQueueNumber(clinic.code, department.code, result.urgency_tier)
      : `Q-${Date.now()}`;

    // Estimated wait time by tier
    const waitByTier = { critical: 0, high: 30, medium: 90, low: 180 };
    const estimatedWait = waitByTier[result.urgency_tier] ?? 60;

    // Create queue entry
    let queueEntry = null;
    if (session.callId && session.clinicId && department && session.patient) {
      queueEntry = await queue.createEntry({
        call_id: session.callId,
        clinic_id: session.clinicId,
        department_id: department.id,
        patient_id: session.patient.id,
        queue_number: queueNum,
        urgency_tier: result.urgency_tier,
        estimated_wait_time: estimatedWait,
      });

      await patients.incrementVisitCount(session.patient.id);

      // Persist location on patient record if we learned it
      const knownLocation = result.patient_location || session.callerCity || null;
      if (knownLocation && session.patient) {
        await db.query(
          'UPDATE patients SET location = $1, updated_at = NOW() WHERE id = $2',
          [knownLocation, session.patient.id]
        );
      }

      // Find nearest hospitals based on location
      const nearbyHospitals = knownLocation
        ? await hospitals.findNearestByLocation(knownLocation, 2)
        : [];

      // Send SMS confirmation (with nearby hospitals appended)
      await sms.sendQueueConfirmation(session.patient, queueNum, estimatedWait, nearbyHospitals, session.language);

      // Fire-and-forget: generate and store transcript embedding for semantic search
      if (session.callId) {
        const transcript = session.messages
          .filter((m) => m.role !== 'system')
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n');
        embeddings.generateAndStore(
          session.callId,
          session.patient.id,
          session.clinicId,
          {
            chief_complaint: result.chief_complaint,
            symptoms: result.symptoms,
            red_flag_details: result.red_flag_details,
            agent_summary: result.agent_summary,
            transcript,
          }
        );
      }

      // Broadcast to clinic dashboard via Socket.IO
      // We need access to io — grab it from the app (set in index.js via app.set)
      // We store it on the module when the webhook router is mounted
      const io = voiceRouter._io;
      if (io) {
        io.to(`clinic:${session.clinicId}`).emit('patient_joined', {
          queue_entry: queueEntry,
        });

        if (result.urgency_tier === 'critical') {
          io.to(`clinic:${session.clinicId}`).emit('critical_alert', {
            queue_entry: queueEntry,
          });
        }
      }
    }

    // Build farewell message with nearest hospital if available
    const nearbyHospitals = result.patient_location || session.callerCity
      ? await hospitals.findNearestByLocation(result.patient_location || session.callerCity, 1)
      : [];
    const nearest = nearbyHospitals[0];

    const farewells = {
      sw: nearest
        ? `Asante. Namba yako ni ${queueNum}. Hospitali iliyo karibu nawe ni ${nearest.name} iliyoko ${nearest.district}. Tafadhali subiri.`
        : `Asante. Namba yako ya kusubiri ni ${queueNum}. Tafadhali subiri.`,
      en: nearest
        ? `Thank you. Your queue number is ${queueNum}. The nearest hospital to you is ${nearest.name} in ${nearest.district}. Please wait to be called.`
        : `Thank you. Your queue number is ${queueNum}. Please take a seat and wait to be called.`,
    };
    const farewell = farewells[lang] ?? farewells.en;

    // Amazon Polly has no Swahili voice — play the local TTS clip when available.
    const farewellTts = getTtsUrl(farewell, lang);
    return xml(res, farewellTts ? twiml.playAndHangup(farewellTts) : twiml.sayAndHangup(farewell, lang));
  } catch (err) {
    console.error('finaliseIntake error:', err);
    return xml(res, twiml.sayAndHangup('Thank you for calling. A staff member will assist you shortly.', lang));
  } finally {
    sessions.destroy(session.callSid);
  }
}

// Attach io after router is created so webhooks can broadcast
const voiceRouter = router;
voiceRouter._io = null;

module.exports = voiceRouter;
module.exports.setIo = (io) => { voiceRouter._io = io; };
