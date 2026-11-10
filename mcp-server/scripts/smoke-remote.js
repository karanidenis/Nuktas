#!/usr/bin/env node
'use strict';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

async function main() {
  const url = process.env.MCP_URL;
  const token = process.env.MCP_REMOTE_TOKEN;
  if (!url || !token) throw new Error('Set MCP_URL and MCP_REMOTE_TOKEN');

  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'nuktas-remote-smoke', version: '1.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const queue = await client.callTool({
      name: 'get_waiting_queue',
      arguments: { clinic_id: '00000000-0000-4000-8000-000000000101' },
    });
    const payload = JSON.parse(queue.content[0].text);
    process.stdout.write(`${JSON.stringify({ ok: true, tools: tools.map((tool) => tool.name), queue_count: payload.count })}\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
