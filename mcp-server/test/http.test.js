'use strict';

process.env.MCP_DATABASE_URL = process.env.MCP_DATABASE_URL || 'postgresql://unused:unused@127.0.0.1:5432/unused';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { createRemoteApp, safeEqual } = require('../src/http');

test('constant-time token comparison handles different lengths', () => {
  assert.equal(safeEqual('judge-token', 'judge-token'), true);
  assert.equal(safeEqual('short', 'judge-token'), false);
});

test('hosted MCP requires bearer auth and exposes all tools', async () => {
  const app = createRemoteApp({ token: 'judge-token', host: '127.0.0.1', allowedHosts: ['127.0.0.1'] });
  const listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address(); const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${base}/health`); assert.equal(health.status, 200);
    const denied = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(denied.status, 401);
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: 'Bearer judge-token' } } });
    const client = new Client({ name: 'hosted-mcp-test', version: '1.0.0' });
    await client.connect(transport); const result = await client.listTools();
    assert.equal(result.tools.length, 8); assert.ok(result.tools.some((tool) => tool.name === 'assess_triage_priority'));
    await client.close();
  } finally { await new Promise((resolve) => listener.close(resolve)); }
});
