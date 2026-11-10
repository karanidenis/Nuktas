'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { registerTools } = require('./tools');

function buildServer(log = () => {}) {
  const server = new McpServer({ name: 'nuktas-triage', version: '0.1.0' });
  registerTools(server, { log });
  return server;
}

module.exports = { buildServer };
