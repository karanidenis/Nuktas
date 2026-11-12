'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBundle } = require('../src/services/fhir');

function packet() {
  return {
    generated_at: '2026-11-12T00:00:00.000Z',
    synthetic: true,
    patient: { name: 'Synthetic Patient' },
    queue_entry: { status: 'waiting' },
    assessment: {
      id: '11111111-1111-4111-8111-111111111111',
      patient_id: '22222222-2222-4222-8222-222222222222',
      queue_entry_id: '33333333-3333-4333-8333-333333333333',
      inserted_at: '2026-11-12T00:00:00.000Z',
      scale: 'SATS', scale_version: '2012', sats_colour: 'orange',
      recommended_urgency: 'high', recommended_department: 'Emergency',
      rationale: 'Synthetic deterministic test',
    },
    latest_vitals: {
      id: '44444444-4444-4444-8444-444444444444',
      recorded_at: '2026-11-12T00:00:00.000Z', heart_rate: 122, spo2: 89,
    },
    clinician_decision: { decision: 'approved', clinician_name: 'Dr Test' },
    disclaimer: 'Decision support only.',
  };
}

test('collection export gives every resource a stable fullUrl', () => {
  const bundle = buildBundle(packet(), { base: 'https://fhir.example.test/fhir' });
  assert.equal(bundle.resourceType, 'Bundle');
  assert.equal(bundle.type, 'collection');
  assert.ok(bundle.entry.length >= 7);
  for (const item of bundle.entry) {
    assert.equal(item.fullUrl, `https://fhir.example.test/fhir/${item.resource.resourceType}/${item.resource.id}`);
    assert.equal(item.request, undefined);
  }
});

test('sync bundle is an idempotent FHIR transaction', () => {
  const bundle = buildBundle(packet(), { transaction: true, base: 'https://fhir.example.test/fhir' });
  assert.equal(bundle.type, 'transaction');
  for (const item of bundle.entry) {
    assert.deepEqual(item.request, { method: 'PUT', url: `${item.resource.resourceType}/${item.resource.id}` });
  }
  assert.equal(bundle.meta.tag[0].code, 'synthetic');
  assert.ok(bundle.entry.some((item) => item.resource.resourceType === 'Provenance'));
  assert.ok(bundle.entry.some((item) => item.resource.resourceType === 'RiskAssessment'));
});
