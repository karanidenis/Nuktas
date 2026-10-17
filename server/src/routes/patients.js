const express = require('express');
const { authenticate } = require('../middleware/auth');
const patients = require('../models/patients');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(authenticate);

// GET /api/v1/patients/:patient_id/history
router.get('/patients/:patient_id/history', asyncHandler(async (req, res) => {
  const result = await patients.getPatientWithHistory(req.params.patient_id);
  if (!result) return res.status(404).json({ error: 'Patient not found' });

  const { patient, calls } = result;
  res.json({
    patient: {
      id: patient.id,
      name: patient.name,
      phone_number: patient.phone_number,
      chronic_conditions: patient.chronic_conditions ?? [],
      visit_count: patient.visit_count,
      no_show_count: patient.no_show_count,
    },
    history: calls.map((c) => ({
      id: c.id,
      date: new Date(c.inserted_at).toISOString(),
      chief_complaint: c.chief_complaint,
      symptoms: c.symptoms ?? [],
      urgency_tier: c.urgency_tier,
      recommended_department: c.recommended_department,
      red_flag_detected: c.red_flag_detected,
      language_code: c.language_code,
    })),
  });
}));

module.exports = router;
