#!/usr/bin/env node
'use strict';

/**
 * Nuktas Triage MCP server — stdio transport.
 *
 * The agent (and the Node.js API) connect to this process as an MCP client. It
 * is the governed boundary between any AI assistant and clinic operations:
 * tools read and write PostgreSQL only through the scope guards in tools.js.
 *
 *   MCP_DATABASE_URL (or DATABASE_URL)  — PostgreSQL connection string
 *
 * Run:  node src/index.js
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const { registerTools } = require('./tools');

function log(msg, meta) {
  // stdio transport: stdout is the protocol channel, so logs go to stderr.
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  process.stderr.write(`[nuktas-triage-mcp] ${msg}${suffix}\n`);
}

async function main() {
  const server = new McpServer({
    name: 'nuktas-triage',
    version: '0.1.0',
  });

  registerTools(server, { log });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('ready on stdio');

  const shutdown = async () => {
    log('shutting down');
    try { await server.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(`[nuktas-triage-mcp] fatal: ${err.message}\n`);
  process.exit(1);
});
