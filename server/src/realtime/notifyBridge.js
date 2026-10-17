'use strict';

/**
 * Postgres LISTEN → Socket.IO bridge.
 *
 * The Triage MCP server (and the API itself) publish everything that changes a
 * patient's state with `pg_notify('nuktas_events', …)`. This bridge holds a
 * single dedicated LISTEN connection and fans each event out to the Socket.IO
 * room for its clinic. That means the agent process, the API, and the MCP server
 * never need to know about each other — one channel keeps the dashboard live.
 *
 * Events are emitted twice by design:
 *   - `nuktas_event`  — every event, with its `type` field, for generic handling
 *   - `<type>`        — e.g. `assessment_created`, for targeted listeners
 */

const { Client } = require('pg');

const CHANNEL = 'nuktas_events';
const RECONNECT_MS = 2_000;

function startNotifyBridge(io, opts = {}) {
  const connectionString =
    opts.connectionString ||
    process.env.MCP_DATABASE_URL ||
    process.env.DATABASE_URL;

  if (!connectionString) {
    console.warn('[notify-bridge] no database URL — real-time bridge disabled');
    return { stop: async () => {} };
  }

  let client = null;
  let stopped = false;
  let retry = null;

  async function connect() {
    if (stopped) return;
    client = new Client({ connectionString });

    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      let payload;
      try {
        payload = JSON.parse(msg.payload);
      } catch {
        return;
      }
      const clinicId = payload.clinic_id;
      if (!clinicId) return;
      const room = `clinic:${clinicId}`;
      io.to(room).emit('nuktas_event', payload);
      if (payload.type) io.to(room).emit(payload.type, payload);
    });

    client.on('error', (err) => {
      console.error('[notify-bridge] connection error:', err.message);
      scheduleReconnect();
    });

    client.on('end', () => {
      if (!stopped) scheduleReconnect();
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      console.log(`[notify-bridge] listening on ${CHANNEL}`);
    } catch (err) {
      console.error('[notify-bridge] failed to listen:', err.message);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (stopped || retry) return;
    retry = setTimeout(() => {
      retry = null;
      // Close the dead socket before re-listening.
      if (client) {
        try { client.end().catch(() => {}); } catch { /* ignore */ }
        client = null;
      }
      connect();
    }, RECONNECT_MS);
  }

  connect();

  return {
    async stop() {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (client) {
        try { await client.end(); } catch { /* ignore */ }
      }
    },
  };
}

module.exports = { startNotifyBridge, CHANNEL };
