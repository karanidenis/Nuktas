const db = require('../db');

async function findOrCreate(phoneNumber) {
  // Try to find first
  const { rows } = await db.query(
    'SELECT * FROM patients WHERE phone_number = $1',
    [phoneNumber]
  );
  if (rows[0]) return rows[0];

  // Create new patient
  const { rows: newRows } = await db.query(
    `INSERT INTO patients (phone_number, preferred_language)
     VALUES ($1, 'sw')
     ON CONFLICT (phone_number) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [phoneNumber]
  );
  return newRows[0];
}

async function getPatient(id) {
  const { rows } = await db.query('SELECT * FROM patients WHERE id = $1', [id]);
  return rows[0] ?? null;
}

async function recordConsent(patientId, given) {
  await db.query(
    `UPDATE patients
     SET consent_given = $1, consent_timestamp = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [given, patientId]
  );
}

async function incrementVisitCount(patientId) {
  await db.query(
    'UPDATE patients SET visit_count = visit_count + 1, updated_at = NOW() WHERE id = $1',
    [patientId]
  );
}

async function incrementNoShowCount(patientId) {
  await db.query(
    'UPDATE patients SET no_show_count = no_show_count + 1, updated_at = NOW() WHERE id = $1',
    [patientId]
  );
}

async function getPatientWithHistory(patientId) {
  const { rows: pRows } = await db.query('SELECT * FROM patients WHERE id = $1', [patientId]);
  const patient = pRows[0];
  if (!patient) return null;

  const { rows: calls } = await db.query(
    `SELECT id, inserted_at, chief_complaint, symptoms, urgency_tier,
            recommended_department, red_flag_detected, red_flag_details, language_code
     FROM calls
     WHERE patient_id = $1
     ORDER BY inserted_at DESC
     LIMIT 20`,
    [patientId]
  );

  return { patient, calls };
}

module.exports = {
  findOrCreate,
  getPatient,
  recordConsent,
  incrementVisitCount,
  incrementNoShowCount,
  getPatientWithHistory,
};
