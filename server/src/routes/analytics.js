const express = require('express');
const { authenticate } = require('../middleware/auth');
const db = require('../db');
const { chat } = require('../services/openai');
const { searchTranscripts } = require('../services/embeddings');
const smsService = require('../services/sms');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

// ── In-memory 5-min cache for load predictions ─────────────────────────────
const predictionCache = new Map(); // clinicId → { data, expiresAt }

// ── Feature 4: Department Load Prediction ──────────────────────────────────
// GET /api/v1/clinics/:clinic_id/load-prediction
router.get('/clinics/:clinic_id/load-prediction', asyncHandler(async (req, res) => {
  const { clinic_id } = req.params;

  // Serve from cache if fresh
  const cached = predictionCache.get(clinic_id);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  try {
    // Historical hourly load for each department over the last 30 days
    const { rows: historical } = await db.query(
      `SELECT
         d.id          AS dept_id,
         d.name        AS dept_name,
         d.code        AS dept_code,
         EXTRACT(DOW  FROM qe.inserted_at)  AS day_of_week,
         EXTRACT(HOUR FROM qe.inserted_at)  AS hour_of_day,
         COUNT(*)                           AS entry_count,
         COUNT(*) FILTER (WHERE qe.urgency_tier = 'critical') AS critical_count
       FROM queue_entries qe
       JOIN departments d ON d.id = qe.department_id
       WHERE qe.clinic_id = $1
         AND qe.inserted_at >= NOW() - INTERVAL '30 days'
       GROUP BY d.id, d.name, d.code, day_of_week, hour_of_day
       ORDER BY d.name, day_of_week, hour_of_day`,
      [clinic_id]
    );

    // Current hour stats
    const { rows: current } = await db.query(
      `SELECT
         d.id   AS dept_id,
         d.name AS dept_name,
         d.code AS dept_code,
         COUNT(*) FILTER (WHERE qe.status IN ('waiting','checked_in','in_progress')) AS active,
         COUNT(*) FILTER (WHERE qe.urgency_tier = 'critical')                        AS critical
       FROM departments d
       LEFT JOIN queue_entries qe
         ON qe.department_id = d.id
        AND qe.clinic_id = $1
        AND qe.inserted_at >= NOW() - INTERVAL '1 hour'
       WHERE d.clinic_id = $1
       GROUP BY d.id, d.name, d.code`,
      [clinic_id]
    );

    // ── Build per-department risk levels ─────────────────────────────────
    const now = new Date();
    const currentHour = now.getHours();
    const currentDow  = now.getDay();

    // Group historical data by dept
    const histByDept = {};
    for (const r of historical) {
      if (!histByDept[r.dept_id]) histByDept[r.dept_id] = [];
      histByDept[r.dept_id].push(r);
    }

    const departments = current.map((dept) => {
      const hist = histByDept[dept.dept_id] ?? [];

      // Same hour + day bucket over last 30 days
      const sameBucket = hist.filter(
        (h) => Number(h.hour_of_day) === currentHour && Number(h.day_of_week) === currentDow
      );
      const avgLoad = sameBucket.length
        ? sameBucket.reduce((s, h) => s + Number(h.entry_count), 0) / sameBucket.length
        : 0;

      const active   = Number(dept.active)   || 0;
      const critical = Number(dept.critical) || 0;

      // Risk: factor in current load vs historical average
      let risk = 'low';
      if (critical > 0 || active > avgLoad * 2) risk = 'critical';
      else if (active > avgLoad * 1.5)          risk = 'high';
      else if (active > avgLoad * 1.1)          risk = 'moderate';

      return {
        dept_id:    dept.dept_id,
        name:       dept.dept_name,
        code:       dept.dept_code,
        active,
        critical,
        avg_historical_load: Math.round(avgLoad * 10) / 10,
        risk,
      };
    });

    // ── GPT narrative summary ─────────────────────────────────────────────
    const deptSummary = departments
      .map((d) => `${d.name}: ${d.active} active (avg ${d.avg_historical_load}), risk=${d.risk}`)
      .join('\n');

    const aiPrompt = `You are a hospital operations analyst. Based on the department load data below,
write a concise 2-3 sentence operational briefing for clinic staff.
Highlight any departments under stress and any patterns worth noting.
Be direct and actionable — no filler phrases.

Current hour: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][currentDow]})

Department Load:
${deptSummary}`;

    let narrative = 'Load prediction data collected. Review department stats for details.';
    try {
      narrative = await chat(
        [
          { role: 'system', content: 'You are a concise hospital operations analyst. Respond in 2-3 sentences only.' },
          { role: 'user',   content: aiPrompt },
        ],
        { temperature: 0.4, maxTokens: 200 }
      );
    } catch (err) {
      console.error('Load prediction GPT error (non-fatal):', err.message);
    }

    const responseData = {
      generated_at: now.toISOString(),
      departments,
      narrative,
    };

    // Cache for 5 minutes
    predictionCache.set(clinic_id, { data: responseData, expiresAt: Date.now() + 5 * 60 * 1000 });

    res.json(responseData);
  } catch (err) {
    console.error('load-prediction error:', err);
    res.status(500).json({ error: 'Failed to generate load prediction' });
  }
}));

// ── Feature 5: Post-Visit Follow-up SMS Generation ─────────────────────────

// POST /api/v1/queue/:entry_id/followup-sms/generate
router.post('/queue/:entry_id/followup-sms/generate', asyncHandler(async (req, res) => {
  const { entry_id } = req.params;

  try {
    const { rows } = await db.query(
      `SELECT
         qe.id, qe.urgency_tier,
         p.id          AS patient_id,
         p.name        AS patient_name,
         p.phone_number AS patient_phone,
         p.preferred_language AS lang,
         d.name        AS dept_name,
         c.chief_complaint, c.symptoms, c.agent_summary,
         c.language_code
       FROM queue_entries qe
       LEFT JOIN patients    p ON p.id = qe.patient_id
       LEFT JOIN departments d ON d.id = qe.department_id
       LEFT JOIN calls       c ON c.id = qe.call_id
       WHERE qe.id = $1`,
      [entry_id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Queue entry not found' });

    const entry = rows[0];
    const lang  = entry.language_code || entry.lang || 'en';

    const langLabel = { sw: 'Kiswahili', en: 'English' }[lang] ?? 'English';
    const symptoms  = Array.isArray(entry.symptoms)
      ? entry.symptoms.join(', ')
      : (entry.symptoms ?? '');

    const prompt = `Generate a post-visit follow-up SMS for a patient who was seen at a clinic in Nairobi, Kenya.
The SMS must be in ${langLabel}.
It must be warm, professional, and exactly 160 characters or fewer (strict limit — never exceed 160 chars).
Include: brief check-in on their health, reminder to follow care instructions or return if symptoms worsen.
Do NOT include generic filler. Do NOT exceed 160 characters. Output the SMS text only, nothing else.

Patient name: ${entry.patient_name ?? 'Patient'}
Chief complaint: ${entry.chief_complaint ?? 'general consultation'}
Symptoms: ${symptoms || 'not specified'}
Department: ${entry.dept_name ?? 'clinic'}
Urgency: ${entry.urgency_tier}`;

    let draft = '';
    try {
      draft = await chat(
        [
          { role: 'system', content: 'You write concise medical follow-up SMS messages. Output ONLY the SMS text, nothing else.' },
          { role: 'user',   content: prompt },
        ],
        { temperature: 0.5, maxTokens: 80 }
      );
      // Truncate if GPT exceeded limit
      if (draft.length > 160) draft = draft.slice(0, 157) + '...';
    } catch (err) {
      console.error('SMS generate GPT error:', err.message);
      return res.status(502).json({ error: 'AI generation failed', message: err.message });
    }

    res.json({
      entry_id,
      patient_phone: entry.patient_phone,
      patient_name:  entry.patient_name,
      language:      lang,
      draft,
      char_count:    draft.length,
    });
  } catch (err) {
    console.error('followup-sms/generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

// POST /api/v1/queue/:entry_id/followup-sms/send
router.post('/queue/:entry_id/followup-sms/send', asyncHandler(async (req, res) => {
  const { entry_id } = req.params;
  const { message, phone } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }
  if (message.length > 160) {
    return res.status(400).json({ error: 'Message exceeds 160 characters' });
  }

  try {
    // Look up the patient's phone if not provided in body
    let toPhone = phone;
    if (!toPhone) {
      const { rows } = await db.query(
        `SELECT p.phone_number
         FROM queue_entries qe
         JOIN patients p ON p.id = qe.patient_id
         WHERE qe.id = $1`,
        [entry_id]
      );
      if (!rows[0]?.phone_number) {
        return res.status(400).json({ error: 'No phone number found for this patient' });
      }
      toPhone = rows[0].phone_number;
    }

    // Send via Twilio (gracefully handles missing credentials)
    const result = await smsService.sendSms(toPhone, message);

    // Log the sent message
    await db.query(
      `INSERT INTO followup_messages (queue_entry_id, to_phone, message, sent_by, sent_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT DO NOTHING`,
      [entry_id, toPhone, message, req.user.id]
    ).catch(() => {}); // table may not exist yet — non-fatal

    res.json({ success: true, to: toPhone, sid: result?.sid ?? null });
  } catch (err) {
    console.error('followup-sms/send error:', err);
    res.status(500).json({ error: 'Failed to send SMS', message: err.message });
  }
}));

// ── Feature 6: Voice Transcript Semantic Search ─────────────────────────────
// GET /api/v1/clinics/:clinic_id/search?q=...
router.get('/clinics/:clinic_id/search', asyncHandler(async (req, res) => {
  const { clinic_id } = req.params;
  const query = (req.query.q ?? '').trim();

  if (!query) return res.status(400).json({ error: 'Query parameter q is required' });
  if (query.length < 2) return res.status(400).json({ error: 'Query too short' });

  try {
    const results = await searchTranscripts(clinic_id, query);
    res.json({ query, results, count: results.length });
  } catch (err) {
    console.error('transcript search error:', err);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
}));

module.exports = router;
