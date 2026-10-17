const express = require('express');
const { authenticate } = require('../middleware/auth');
const queue = require('../models/queue');
const clinics = require('../models/clinics');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// All clinic routes require auth
router.use(authenticate);

// GET /api/v1/clinics/:clinic_id/queue
router.get('/clinics/:clinic_id/queue', asyncHandler(async (req, res) => {
  const { clinic_id } = req.params;
  const [entries, stats] = await Promise.all([
    queue.getClinicQueue(clinic_id),
    queue.getQueueStats(clinic_id),
  ]);
  res.json({ clinic_id, stats, queue: entries });
}));

// GET /api/v1/clinics/:clinic_id/departments
router.get('/clinics/:clinic_id/departments', asyncHandler(async (req, res) => {
  const { clinic_id } = req.params;
  const depts = await clinics.getDepartmentsWithStats(clinic_id);
  res.json({
    clinic_id,
    departments: depts.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      status: d.status,
      staff_available: d.staff_available,
      avg_wait_time: d.avg_wait_time,
      queue_count: d.queue_count,
      is_emergency: d.is_emergency,
    })),
  });
}));

// POST /api/v1/clinics/:clinic_id/queue/:queue_id/check-in
router.post('/clinics/:clinic_id/queue/:queue_id/check-in', asyncHandler(async (req, res) => {
  const { queue_id, clinic_id } = req.params;
  const entry = await queue.checkInEntry(queue_id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });

  // Broadcast real-time update
  req.app.get('io').to(`clinic:${clinic_id}`).emit('status_update', {
    entry_id: queue_id,
    status: 'checked_in',
    queue_entry: entry,
  });

  res.json({ success: true, entry });
}));

// POST /api/v1/clinics/:clinic_id/queue/:queue_id/status
router.post('/clinics/:clinic_id/queue/:queue_id/status', asyncHandler(async (req, res) => {
  const { queue_id, clinic_id } = req.params;
  const { status } = req.body;

  const statusHandlers = {
    checked_in: () => queue.checkInEntry(queue_id),
    in_progress: () => queue.startEntry(queue_id),
    completed:   () => queue.completeEntry(queue_id),
    no_show:     () => queue.markNoShow(queue_id),
  };

  const handler = statusHandlers[status];
  if (!handler) return res.status(400).json({ error: `Invalid status: ${status}` });

  const entry = await handler();
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });

  req.app.get('io').to(`clinic:${clinic_id}`).emit('status_update', {
    entry_id: queue_id,
    status,
    queue_entry: entry,
  });

  res.json({ success: true, entry });
}));

// POST /api/v1/clinics/:clinic_id/queue/:queue_id/acknowledge
router.post('/clinics/:clinic_id/queue/:queue_id/acknowledge', asyncHandler(async (req, res) => {
  const { queue_id, clinic_id } = req.params;
  const entry = await queue.acknowledgeAlert(queue_id, req.user.id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });

  req.app.get('io').to(`clinic:${clinic_id}`).emit('alert_acknowledged', {
    entry_id: queue_id,
    acknowledged_by: req.user.name,
    acknowledged_at: new Date().toISOString(),
  });

  res.json({ success: true, acknowledged_at: entry.acknowledged_at });
}));

module.exports = router;
