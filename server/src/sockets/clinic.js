const { verifySocketToken } = require('../middleware/auth');
const queue = require('../models/queue');

/**
 * Attach Socket.IO clinic channel logic.
 * Mirrors the Phoenix ClinicChannel behaviour.
 *
 * Events emitted to clients:
 *   queue_state        — full snapshot on join
 *   patient_joined     — new queue entry arrived (via voice webhook)
 *   status_update      — an entry's status changed
 *   critical_alert     — a critical patient was queued
 *   alert_acknowledged — a critical alert was ack'd
 *
 * Events listened from clients:
 *   join:clinic        — join a clinic room { clinicId }
 *   acknowledge_alert  — { entry_id }
 *   check_in           — { entry_id }
 *   update_status      — { entry_id, status }
 *   ping               — heartbeat check
 */
function setupClinicSocket(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const user = await verifySocketToken(token);
    if (!user) return next(new Error('Unauthorized'));
    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const { user } = socket;

    // --- Join a clinic room --------------------------------------------------
    socket.on('join:clinic', async ({ clinicId }) => {
      if (!clinicId) return socket.emit('error', { reason: 'clinicId required' });

      // Admins can join any clinic; staff only their own
      if (user.role !== 'admin' && user.clinic_id !== clinicId) {
        return socket.emit('error', { reason: 'unauthorized' });
      }

      socket.join(`clinic:${clinicId}`);

      // Push full queue state on join
      const [entries, stats, alerts] = await Promise.all([
        queue.getClinicQueue(clinicId),
        queue.getQueueStats(clinicId),
        queue.getUnacknowledgedAlerts(clinicId),
      ]);

      socket.emit('queue_state', {
        queue: entries,
        stats,
        critical_alerts: alerts,
      });
    });

    // --- Acknowledge a critical alert ----------------------------------------
    socket.on('acknowledge_alert', async ({ entry_id }) => {
      if (!entry_id) return;

      const entry = await queue.acknowledgeAlert(entry_id, user.id);
      if (!entry) return socket.emit('error', { reason: 'entry not found' });

      const clinicId = entry.patient ? await getClinicIdForEntry(entry_id) : null;
      if (clinicId) {
        io.to(`clinic:${clinicId}`).emit('alert_acknowledged', {
          entry_id,
          acknowledged_by: user.name,
          acknowledged_at: new Date().toISOString(),
        });
      }

      socket.emit('ack', { ok: true });
    });

    // --- Check in a patient --------------------------------------------------
    socket.on('check_in', async ({ entry_id }) => {
      if (!entry_id) return;

      const entry = await queue.checkInEntry(entry_id);
      if (!entry) return socket.emit('error', { reason: 'entry not found' });

      const clinicId = await getClinicIdForEntry(entry_id);
      if (clinicId) {
        io.to(`clinic:${clinicId}`).emit('status_update', {
          entry_id,
          status: 'checked_in',
          queue_entry: entry,
        });
      }

      socket.emit('ack', { ok: true, entry });
    });

    // --- Update patient status -----------------------------------------------
    socket.on('update_status', async ({ entry_id, status }) => {
      if (!entry_id || !status) return;

      const handlers = {
        in_progress: () => queue.startEntry(entry_id),
        completed:   () => queue.completeEntry(entry_id),
        no_show:     () => queue.markNoShow(entry_id),
      };

      const handler = handlers[status];
      if (!handler) return socket.emit('error', { reason: `invalid status: ${status}` });

      const entry = await handler();
      if (!entry) return socket.emit('error', { reason: 'entry not found' });

      const clinicId = await getClinicIdForEntry(entry_id);
      if (clinicId) {
        io.to(`clinic:${clinicId}`).emit('status_update', {
          entry_id,
          status,
          queue_entry: entry,
        });
      }

      socket.emit('ack', { ok: true });
    });

    // --- Heartbeat -----------------------------------------------------------
    socket.on('ping', (_, cb) => {
      if (typeof cb === 'function') cb({ pong: true });
      else socket.emit('pong');
    });

    socket.on('disconnect', () => {
      // rooms are cleaned up automatically by Socket.IO
    });
  });
}

// Lazy-load db to avoid circular dependency at module evaluation time
async function getClinicIdForEntry(entryId) {
  const db = require('../db');
  const { rows } = await db.query(
    'SELECT clinic_id FROM queue_entries WHERE id = $1',
    [entryId]
  );
  return rows[0]?.clinic_id ?? null;
}

module.exports = { setupClinicSocket };
