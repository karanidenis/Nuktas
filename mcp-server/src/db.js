'use strict';

/**
 * Database access for the Triage MCP server.
 *
 * This process is the ONLY place the agent's tools touch PostgreSQL. The
 * language model never receives a connection string or a SQL statement — it can
 * only call the tools registered in tools.js, and every one of those enforces
 * clinic scope before it runs a query.
 */

const { Pool } = require('pg');

const connectionString =
  process.env.MCP_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  // Fail loudly at startup rather than at first tool call.
  console.error('[mcp] DATABASE_URL is not set — the Triage MCP server cannot start.');
}

const pool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[mcp] Unexpected DB pool error:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Publish a real-time event to the Node.js API over Postgres NOTIFY. The API
 * holds a dedicated LISTEN connection and fans these out to Socket.IO rooms, so
 * the UI updates the moment a governed action happens — without this process
 * needing to know anything about sockets.
 */
async function notify(channel, payload) {
  if (!/^[a-z_]+$/.test(channel)) throw new Error(`Unsafe channel name: ${channel}`);
  await pool.query('SELECT pg_notify($1, $2)', [channel, JSON.stringify(payload ?? {})]);
}

async function close() {
  await pool.end();
}

module.exports = { query, notify, close, pool };
