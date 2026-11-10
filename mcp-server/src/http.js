#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const { createMcpExpressApp } = require('@modelcontextprotocol/sdk/server/express.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { buildServer } = require('./server');

function safeEqual(actual, expected) {
  const a = Buffer.from(actual || ''); const b = Buffer.from(expected || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function bearerToken(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function createRemoteApp(options = {}) {
  const token = options.token ?? process.env.MCP_REMOTE_TOKEN;
  if (!token) throw new Error('MCP_REMOTE_TOKEN is required');
  const host = options.host || process.env.MCP_HOST || '0.0.0.0';
  const allowedHosts = options.allowedHosts || (process.env.MCP_ALLOWED_HOSTS || 'localhost,127.0.0.1')
    .split(',').map((item) => item.trim()).filter(Boolean);
  const app = createMcpExpressApp({ host, allowedHosts });
  const windowMs = 60_000; const maxRequests = Number(process.env.MCP_RATE_LIMIT || 120); const clients = new Map();

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'nuktas-triage-mcp', transport: 'streamable-http' }));

  app.use('/mcp', (req, res, next) => {
    if (!safeEqual(bearerToken(req), token)) return res.status(401).json({ error: 'Unauthorized' });
    const key = req.ip || req.socket.remoteAddress || 'unknown'; const now = Date.now(); const bucket = clients.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) clients.set(key, { startedAt: now, count: 1 });
    else if (++bucket.count > maxRequests) return res.status(429).json({ error: 'Rate limit exceeded' });
    return next();
  });

  app.post('/mcp', async (req, res) => {
    const log = (message, meta) => process.stderr.write(`[nuktas-triage-mcp-http] ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}\n`);
    const server = buildServer(log);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    } catch (error) {
      log('request failed', { error: error.message });
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  });
  app.get('/mcp', (_req, res) => res.status(405).json({ error: 'Stateless server accepts POST requests only' }));
  app.delete('/mcp', (_req, res) => res.status(405).json({ error: 'Stateless server has no sessions to terminate' }));
  return app;
}

async function main() {
  if (process.env.MCP_BOOTSTRAP_SYNTHETIC === 'true') {
    const { bootstrapSyntheticDatabase } = require('./renderBootstrap');
    await bootstrapSyntheticDatabase();
  }
  // Render assigns PORT dynamically. MCP_HTTP_PORT remains available for the
  // Docker Compose/VPS deployment where we control the listener port.
  const port = Number(process.env.PORT || process.env.MCP_HTTP_PORT || 8200); const host = process.env.MCP_HOST || '0.0.0.0';
  const app = createRemoteApp({ host });
  app.listen(port, host, (error) => {
    if (error) { process.stderr.write(`[nuktas-triage-mcp-http] fatal: ${error.message}\n`); process.exit(1); }
    process.stderr.write(`[nuktas-triage-mcp-http] ready on http://${host}:${port}/mcp\n`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[nuktas-triage-mcp-http] fatal: ${error.message}\n`);
    process.exit(1);
  });
}
module.exports = { createRemoteApp, safeEqual };
