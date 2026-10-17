const db = require('../db');

// ── Formatting ────────────────────────────────────────────────────────────────

function urgencyColor(tier) {
  return { critical: 'red', high: 'orange', medium: 'yellow', low: 'green' }[tier] ?? 'gray';
}

function formatEntry(row) {
  return {
    id: row.id,
    queue_number: row.queue_number,
    urgency_tier: row.urgency_tier,
    urgency_color: urgencyColor(row.urgency_tier),
    position_in_queue: row.position_in_queue,
    status: row.status,
    estimated_wait_time: row.estimated_wait_time,
    critical_alert_acknowledged: row.critical_alert_acknowledged,
    patient: row.patient_id
      ? {
          id: row.patient_id,
          name: row.patient_name,
          phone_number: row.patient_phone,
          chronic_conditions: row.chronic_conditions ?? [],
        }
      : null,
    department: row.department_id
      ? {
          id: row.department_id,
          name: row.dept_name,
          code: row.dept_code,
        }
      : null,
    chief_complaint: row.chief_complaint ?? null,
    red_flag_details: row.red_flag_details ?? null,
    inserted_at: row.inserted_at ? new Date(row.inserted_at).toISOString() : null,
  };
}

// ── Base query ────────────────────────────────────────────────────────────────

const BASE_SELECT = `
  SELECT
    qe.id, qe.queue_number, qe.urgency_tier, qe.position_in_queue, qe.status,
    qe.estimated_wait_time, qe.critical_alert_acknowledged,
    qe.acknowledged_at, qe.checked_in_at, qe.in_progress_at, qe.completed_at,
    qe.notes, qe.clinic_id, qe.inserted_at,
    p.id        AS patient_id,
    p.name      AS patient_name,
    p.phone_number AS patient_phone,
    p.chronic_conditions,
    d.id        AS department_id,
    d.name      AS dept_name,
    d.code      AS dept_code,
    c.chief_complaint,
    c.red_flag_details,
    c.red_flag_detected
  FROM queue_entries qe
  LEFT JOIN patients    p ON p.id = qe.patient_id
  LEFT JOIN departments d ON d.id = qe.department_id
  LEFT JOIN calls       c ON c.id = qe.call_id
`;

// ── Reads ─────────────────────────────────────────────────────────────────────

async function getEntry(id) {
  const { rows } = await db.query(`${BASE_SELECT} WHERE qe.id = $1`, [id]);
  return rows[0] ? formatEntry(rows[0]) : null;
}

async function getClinicQueue(clinicId) {
  const { rows } = await db.query(
    `${BASE_SELECT}
     WHERE qe.clinic_id = $1
       AND qe.status IN ('waiting','checked_in','in_progress')
     ORDER BY qe.position_in_queue ASC NULLS LAST, qe.inserted_at ASC`,
    [clinicId]
  );
  return rows.map(formatEntry);
}

async function getUnacknowledgedAlerts(clinicId) {
  const { rows } = await db.query(
    `${BASE_SELECT}
     WHERE qe.clinic_id = $1
       AND qe.urgency_tier = 'critical'
       AND qe.critical_alert_acknowledged = false
       AND qe.status IN ('waiting','checked_in','in_progress')`,
    [clinicId]
  );
  return rows.map(formatEntry);
}

async function getQueueStats(clinicId) {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)                                              AS total,
       COUNT(*) FILTER (WHERE status = 'waiting')           AS waiting,
       COUNT(*) FILTER (WHERE status = 'checked_in')        AS checked_in,
       COUNT(*) FILTER (WHERE status = 'in_progress')       AS in_progress,
       COUNT(*) FILTER (WHERE urgency_tier = 'critical')    AS critical,
       COALESCE(
         ROUND(
           AVG(
             EXTRACT(EPOCH FROM (checked_in_at - inserted_at)) / 60
           ) FILTER (WHERE checked_in_at IS NOT NULL)
           ::numeric, 0
         )::int,
         0
       )                                                    AS avg_wait
     FROM queue_entries
     WHERE clinic_id = $1
       AND status IN ('waiting','checked_in','in_progress')`,
    [clinicId]
  );
  const r = rows[0];
  return {
    total:       Number(r.total),
    waiting:     Number(r.waiting),
    checked_in:  Number(r.checked_in),
    in_progress: Number(r.in_progress),
    critical:    Number(r.critical),
    avg_wait:    Number(r.avg_wait) || 0,
  };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

async function updateEntryStatus(id, fields) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = $${i}`);
    vals.push(v);
    i++;
  }
  sets.push(`updated_at = NOW()`);
  vals.push(id);

  await db.query(
    `UPDATE queue_entries SET ${sets.join(', ')} WHERE id = $${i}`,
    vals
  );
}

async function checkInEntry(id) {
  await updateEntryStatus(id, { status: 'checked_in', checked_in_at: new Date() });
  await reorderQueue(await getDeptIdForEntry(id));
  return getEntry(id);
}

async function startEntry(id) {
  await updateEntryStatus(id, { status: 'in_progress', in_progress_at: new Date() });
  await reorderQueue(await getDeptIdForEntry(id));
  return getEntry(id);
}

async function completeEntry(id) {
  await updateEntryStatus(id, { status: 'completed', completed_at: new Date() });
  await reorderQueue(await getDeptIdForEntry(id));
  return getEntry(id);
}

async function markNoShow(id) {
  await updateEntryStatus(id, { status: 'no_show' });
  await reorderQueue(await getDeptIdForEntry(id));
  return getEntry(id);
}

async function acknowledgeAlert(entryId, userId) {
  await updateEntryStatus(entryId, {
    critical_alert_acknowledged: true,
    acknowledged_by: userId,
    acknowledged_at: new Date(),
  });
  return getEntry(entryId);
}

async function createEntry(attrs) {
  const { rows } = await db.query(
    `INSERT INTO queue_entries
       (call_id, clinic_id, department_id, patient_id, queue_number, urgency_tier,
        status, estimated_wait_time)
     VALUES ($1,$2,$3,$4,$5,$6,'waiting',$7)
     RETURNING id`,
    [
      attrs.call_id,
      attrs.clinic_id,
      attrs.department_id,
      attrs.patient_id,
      attrs.queue_number,
      attrs.urgency_tier,
      attrs.estimated_wait_time ?? null,
    ]
  );
  const entry = await getEntry(rows[0].id);
  await reorderQueue(attrs.department_id);
  return entry;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getDeptIdForEntry(entryId) {
  const { rows } = await db.query(
    'SELECT department_id FROM queue_entries WHERE id = $1',
    [entryId]
  );
  return rows[0]?.department_id;
}

async function reorderQueue(departmentId) {
  if (!departmentId) return;
  // Re-number positions: critical first, then high, medium, low; oldest first within tier
  const { rows } = await db.query(
    `SELECT id FROM queue_entries
     WHERE department_id = $1 AND status = 'waiting'
     ORDER BY
       CASE urgency_tier
         WHEN 'critical' THEN 1
         WHEN 'high'     THEN 2
         WHEN 'medium'   THEN 3
         WHEN 'low'      THEN 4
         ELSE 5
       END,
       inserted_at ASC`,
    [departmentId]
  );

  for (let i = 0; i < rows.length; i++) {
    await db.query(
      'UPDATE queue_entries SET position_in_queue = $1, updated_at = NOW() WHERE id = $2',
      [i + 1, rows[i].id]
    );
  }
}

function generateQueueNumber(clinicCode, deptCode, urgencyTier) {
  const tier = urgencyTier.slice(0, 4).toUpperCase();
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `${clinicCode}-${deptCode}-${tier}-${seq}`;
}

module.exports = {
  getEntry,
  getClinicQueue,
  getUnacknowledgedAlerts,
  getQueueStats,
  checkInEntry,
  startEntry,
  completeEntry,
  markNoShow,
  acknowledgeAlert,
  createEntry,
  generateQueueNumber,
  formatEntry,
};
