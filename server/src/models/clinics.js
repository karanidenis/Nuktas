const db = require('../db');

async function getClinic(id) {
  const { rows } = await db.query(
    'SELECT * FROM clinics WHERE id = $1 AND is_active = true',
    [id]
  );
  return rows[0] ?? null;
}

async function getDefaultClinic() {
  const { rows } = await db.query(
    'SELECT * FROM clinics WHERE is_active = true ORDER BY inserted_at ASC LIMIT 1'
  );
  return rows[0] ?? null;
}

async function getDepartmentsWithStats(clinicId) {
  const { rows } = await db.query(
    `SELECT
       d.*,
       COUNT(qe.id) FILTER (
         WHERE qe.status IN ('waiting','checked_in','in_progress')
       )::int AS queue_count
     FROM departments d
     LEFT JOIN queue_entries qe ON qe.department_id = d.id
     WHERE d.clinic_id = $1
     GROUP BY d.id
     ORDER BY d.is_emergency DESC, d.name ASC`,
    [clinicId]
  );
  return rows;
}

async function getDepartment(id) {
  const { rows } = await db.query('SELECT * FROM departments WHERE id = $1', [id]);
  return rows[0] ?? null;
}

async function getDepartmentByCode(clinicId, code) {
  const { rows } = await db.query(
    'SELECT * FROM departments WHERE clinic_id = $1 AND code = $2',
    [clinicId, code]
  );
  return rows[0] ?? null;
}

async function getDepartmentByName(clinicId, name) {
  const { rows } = await db.query(
    `SELECT * FROM departments
     WHERE clinic_id = $1
       AND lower(name) ILIKE lower($2)
     LIMIT 1`,
    [clinicId, `%${name}%`]
  );
  return rows[0] ?? null;
}

module.exports = {
  getClinic,
  getDefaultClinic,
  getDepartmentsWithStats,
  getDepartment,
  getDepartmentByCode,
  getDepartmentByName,
};
