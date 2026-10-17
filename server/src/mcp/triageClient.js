'use strict';

/**
 * MCP client for the Nuktas Triage MCP server.
 *
 * The Node API is a *client* of the same governed MCP boundary the AI agent
 * uses. When a nurse approves a recommendation, the API does not run queue SQL
 * itself — it calls the `apply_approved_queue_update` tool, which refuses to run
 * without a matching approval row. That keeps a single, auditable write path for
 * every change to a patient's queue position.
 *
 * The MCP server speaks stdio, so this module spawns it as a long-lived child
 * process and reuses the connection. If the child dies, the next call respawns
 * it. If the MCP server cannot start at all, calls fail closed with a clear
 * error rather than falling back to an ungated write.
 */

const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const DEFAULT_ENTRY = path.join(__dirname, '..', '..', '..', 'mcp-server', 'src', 'index.js');

let clientPromise = null;

/**
 * Resolve the command + args used to launch the MCP server.
 * `MCP_SERVER_CMD` / `MCP_SERVER_ENTRY` let an operator point at a container or
 * an installed package instead of the repository checkout.
 */
function serverLaunch() {
  const entry = process.env.MCP_SERVER_ENTRY || DEFAULT_ENTRY;
  return {
    command: process.env.MCP_SERVER_CMD || process.execPath,
    args: [entry],
    cwd: process.env.MCP_SERVER_CWD || path.dirname(path.dirname(entry)),
  };
}

/**
 * Build the child environment. StdioClientTransport REPLACES the environment
 * when `env` is passed, so spread the parent process env to keep PATH etc., and
 * make sure the triage DB is reachable under both names.
 */
function childEnv() {
  const databaseUrl = process.env.MCP_DATABASE_URL || process.env.DATABASE_URL;
  return {
    ...process.env,
    ...(databaseUrl ? { MCP_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl } : {}),
  };
}

async function connect() {
  const client = new Client(
    { name: 'nuktas-api', version: '0.1.0' },
    { capabilities: {} }
  );

  const transport = new StdioClientTransport({
    ...serverLaunch(),
    env: childEnv(),
    stderr: 'inherit',
  });

  transport.onerror = (err) => {
    console.error('[mcp-client] transport error:', err.message);
  };
  // Drop the cached connection so the next call reconnects.
  transport.onclose = () => {
    clientPromise = null;
  };

  await client.connect(transport);
  return client;
}

function getClient() {
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

/**
 * Parse the text payload a Nuktas tool returns into a JS object.
 * Tools return `{ content: [{ type: 'text', text: '<json>' }], isError }`.
 */
function parseContent(result) {
  const text = (result?.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * Call an MCP tool by name.
 * @param {string} name
 * @param {object} args
 * @returns {Promise<{ ok: boolean, data: object }>} `ok` is false when the tool
 *   reported `isError` (e.g. the approval gate held). `data` is the parsed JSON.
 * @throws when the MCP server itself is unreachable.
 */
async function callTool(name, args = {}) {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args });
  return { ok: !result?.isError, data: parseContent(result) };
}

/**
 * Liveness probe for the MCP boundary. Returns the tool count when the child
 * is reachable, or an error message. Never throws.
 */
async function ping() {
  try {
    const client = await getClient();
    const { tools } = await client.listTools();
    return { connected: true, tools: tools.length };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

/** Close the child connection (used on shutdown and in tests). */
async function close() {  if (!clientPromise) return;
  const pending = clientPromise;
  clientPromise = null;
  try {
    const client = await pending;
    await client.close();
  } catch {
    /* already gone */
  }
}

module.exports = { callTool, close, getClient, ping, serverLaunch, childEnv, DEFAULT_ENTRY };
