'use strict';

// The MCP server must be loadable and must expose exactly the tools we claim.
// DATABASE_URL is set to a dummy so db.js does not warn; pg connects lazily and
// this test never issues a query.
process.env.MCP_DATABASE_URL = process.env.MCP_DATABASE_URL || 'postgresql://unused:unused@127.0.0.1:5432/unused';

const test = require('node:test');
const assert = require('node:assert/strict');

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');

const { registerTools, evaluateGate } = require('../src/tools');

const EXPECTED_TOOLS = [
  'get_waiting_queue',
  'get_latest_vitals',
  'get_patient_history',
  'record_vitals',
  'assess_triage_priority',
  'flag_deterioration_for_review',
  'request_clinician_approval',
  'apply_approved_queue_update',
];

test('the MCP server registers every advertised tool (listTools over the wire)', async () => {
  const server = new McpServer({ name: 'nuktas-triage-test', version: '0.1.0' });
  registerTools(server, { log: () => {} });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();

  assert.deepEqual(names, [...EXPECTED_TOOLS].sort());
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 20, `${t.name} has a description`);
    assert.ok(t.inputSchema, `${t.name} has an input schema`);
  }

  await client.close();
  await server.close();
});

test('only the apply tool is allowed to move a patient (its description says so)', async () => {
  const server = new McpServer({ name: 'nuktas-triage-test', version: '0.1.0' });
  registerTools(server, { log: () => {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  const apply = tools.find((t) => t.name === 'apply_approved_queue_update');
  assert.match(apply.description, /refuses to run unless/i);
  const required = apply.inputSchema.required || [];
  assert.ok(Array.isArray(required) ? required.includes('approval_id') : /approval_id/.test(required),
    'approval_id is a required input');

  await client.close();
  await server.close();
});

// ── The gate — pure decision logic ────────────────────────────────────────────
test('gate: a missing approval holds', () => {
  const r = evaluateGate({ id: 'a', queue_entry_id: 'q' }, null);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_approval');
});

test('gate: a rejected decision holds', () => {
  const r = evaluateGate({ id: 'a', queue_entry_id: 'q' }, { decision: 'rejected' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'rejected');
});

test('gate: a missing queue link holds', () => {
  const r = evaluateGate({ id: 'a', queue_entry_id: null }, { decision: 'approved' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_linked_to_queue_entry');
});

test('gate: an approved decision opens exactly once', () => {
  const r = evaluateGate({ id: 'a', queue_entry_id: 'q' }, { decision: 'approved' });
  assert.equal(r.ok, true);
  assert.equal(r.already_applied, undefined);
});

test('gate: re-applying is idempotent, not a second change', () => {
  const r = evaluateGate({ id: 'a', queue_entry_id: 'q', applied_at: new Date() }, null);
  assert.equal(r.ok, true);
  assert.equal(r.already_applied, true);
});

test('gate: a missing assessment is an error, not a silent pass', () => {
  const r = evaluateGate(null, { decision: 'approved' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'assessment_not_found');
});
