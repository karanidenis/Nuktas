'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assess,
  scoreTews,
  selectBand,
  colourFromTews,
} = require('../src/sats');

// ── Helpers ───────────────────────────────────────────────────────────────────
// A neutral adult observation set: every vital sits in the 0-point column, so
// the total equals whatever we deliberately override.
const NEUTRAL_ADULT = {
  ageYears: 30,
  mobility: 'walking',
  respiratory_rate: 12,
  heart_rate: 80,
  systolic_bp: 120,
  temperature_c: 37,
  avpu: 'alert',
  trauma: false,
};

function pointsFor(override, key, bandVitals) {
  const vitals = { ...NEUTRAL_ADULT, ...bandVitals, ...override };
  const result = scoreTews(vitals, selectBand(vitals));
  const row = result.breakdown.find((b) => b.vital === key);
  return row ? row.points : null;
}

function urgentSigns(vitals, signs) {
  return assess(vitals, { clinicalSigns: signs });
}

// ── Variant selection (p.24, p.26) ────────────────────────────────────────────
test('selects the published TEWS variant from age or height', () => {
  assert.equal(selectBand({ ageYears: 2 }), 'younger_child');
  assert.equal(selectBand({ ageYears: 5 }), 'older_child');
  assert.equal(selectBand({ ageYears: 15 }), 'adult');
  assert.equal(selectBand({ heightCm: 90 }), 'younger_child');
  assert.equal(selectBand({ heightCm: 120 }), 'older_child');
  assert.equal(selectBand({ heightCm: 160 }), 'adult');
  // Height wins when both are present (edge cases), matching the manual.
  assert.equal(selectBand({ ageYears: 4, heightCm: 160 }), 'adult');
});

// ── Adult TEWS — Figure 14 ────────────────────────────────────────────────────
test('adult respiratory rate boundaries match Figure 14', () => {
  const exp = { 8: 2, 9: 0, 14: 0, 15: 1, 20: 1, 21: 2, 29: 2, 30: 3 };
  for (const [rr, pts] of Object.entries(exp)) {
    assert.equal(pointsFor({ respiratory_rate: Number(rr) }, 'respiratory_rate'), pts, `RR ${rr}`);
  }
});

test('adult heart rate boundaries match Figure 14', () => {
  const exp = { 40: 2, 41: 1, 50: 1, 51: 0, 100: 0, 101: 1, 110: 1, 111: 2, 129: 2, 130: 3 };
  for (const [hr, pts] of Object.entries(exp)) {
    assert.equal(pointsFor({ heart_rate: Number(hr) }, 'heart_rate'), pts, `HR ${hr}`);
  }
});

test('adult systolic BP boundaries match Figure 14', () => {
  const exp = { 70: 3, 71: 2, 80: 2, 81: 1, 100: 1, 101: 0, 199: 0, 200: 2 };
  for (const [sbp, pts] of Object.entries(exp)) {
    assert.equal(pointsFor({ systolic_bp: Number(sbp) }, 'systolic_bp'), pts, `SBP ${sbp}`);
  }
});

test('temperature scores only 0 or 2 points', () => {
  assert.equal(pointsFor({ temperature_c: 34.9 }, 'temperature_c'), 2);
  assert.equal(pointsFor({ temperature_c: 35 }, 'temperature_c'), 0);
  assert.equal(pointsFor({ temperature_c: 38.4 }, 'temperature_c'), 0);
  assert.equal(pointsFor({ temperature_c: 38.5 }, 'temperature_c'), 2);
});

test('adult AVPU boundaries match Figure 14 (Confused = 2, Unresponsive = 3)', () => {
  assert.equal(pointsFor({ avpu: 'alert' }, 'avpu'), 0);
  assert.equal(pointsFor({ avpu: 'reacts_to_voice' }, 'avpu'), 1);
  assert.equal(pointsFor({ avpu: 'confused' }, 'avpu'), 2);
  assert.equal(pointsFor({ avpu: 'reacts_to_pain' }, 'avpu'), 2);
  assert.equal(pointsFor({ avpu: 'unresponsive' }, 'avpu'), 3);
});

test('adult mobility and trauma scores', () => {
  assert.equal(pointsFor({ mobility: 'walking' }, 'mobility'), 0);
  assert.equal(pointsFor({ mobility: 'with_help' }, 'mobility'), 1);
  assert.equal(pointsFor({ mobility: 'stretcher_immobile' }, 'mobility'), 2);
  assert.equal(pointsFor({ mobility: 'wheelchair' }, 'mobility'), 2);
  assert.equal(pointsFor({ trauma: true }, 'trauma'), 1);
});

// ── Older child TEWS — Figure 13 ──────────────────────────────────────────────
test('older child respiratory rate and heart rate boundaries match Figure 13', () => {
  const ch = { ageYears: 6, mobility: 'normal' };
  const rrExp = { 14: 3, 15: 2, 16: 2, 17: 0, 21: 0, 22: 1, 26: 1, 27: 2 };
  for (const [rr, pts] of Object.entries(rrExp)) {
    assert.equal(pointsFor({ respiratory_rate: Number(rr) }, 'respiratory_rate', ch), pts, `RR ${rr}`);
  }
  const hrExp = { 59: 3, 60: 2, 79: 2, 80: 0, 99: 0, 100: 1, 129: 1, 130: 2 };
  for (const [hr, pts] of Object.entries(hrExp)) {
    assert.equal(pointsFor({ heart_rate: Number(hr) }, 'heart_rate', ch), pts, `HR ${hr}`);
  }
});

test('older child has no systolic BP row (manual does not recommend BP in children)', () => {
  const vitals = { ageYears: 6, mobility: 'normal', respiratory_rate: 19, heart_rate: 90,
    temperature_c: 37, avpu: 'alert', trauma: false, systolic_bp: 60 };
  const r = scoreTews(vitals, 'older_child');
  assert.equal(r.breakdown.find((b) => b.vital === 'systolic_bp'), undefined);
  assert.equal(r.total, 0, 'low BP must not change a paediatric TEWS');
});

// ── Younger child TEWS — Figure 12 ────────────────────────────────────────────
test('younger child respiratory rate and heart rate boundaries match Figure 12', () => {
  const ch = { ageYears: 1, mobility: 'normal' };
  const rrExp = { 19: 3, 20: 2, 25: 2, 26: 0, 39: 0, 40: 2, 49: 2, 50: 3 };
  for (const [rr, pts] of Object.entries(rrExp)) {
    assert.equal(pointsFor({ respiratory_rate: Number(rr) }, 'respiratory_rate', ch), pts, `RR ${rr}`);
  }
  const hrExp = { 69: 3, 70: 2, 79: 2, 80: 0, 130: 0, 131: 2, 159: 2, 160: 3 };
  for (const [hr, pts] of Object.entries(hrExp)) {
    assert.equal(pointsFor({ heart_rate: Number(hr) }, 'heart_rate', ch), pts, `HR ${hr}`);
  }
});

// ── Priority colour thresholds — flowchart p.10-11 ────────────────────────────
test('TEWS thresholds map to SATS colours exactly', () => {
  assert.equal(colourFromTews(0), 'green');
  assert.equal(colourFromTews(2), 'green');
  assert.equal(colourFromTews(3), 'yellow');
  assert.equal(colourFromTews(4), 'yellow');
  assert.equal(colourFromTews(5), 'orange');
  assert.equal(colourFromTews(6), 'orange');
  assert.equal(colourFromTews(7), 'red');
  assert.equal(colourFromTews(12), 'red');
});

test('target times follow the published SATS categories', () => {
  // Red immediate, Orange <10 min, Yellow <60 min, Green <240 min.
  assert.equal(assess({ ...NEUTRAL_ADULT }).target_minutes, 240);                                                       // TEWS 0 -> green
  assert.equal(assess({ ...NEUTRAL_ADULT, respiratory_rate: 30 }).target_minutes, 60);                                  // TEWS 3 -> yellow
  assert.equal(assess({ ...NEUTRAL_ADULT, respiratory_rate: 30, heart_rate: 130 }).target_minutes, 10);                 // TEWS 6 -> orange
  assert.equal(assess({ ...NEUTRAL_ADULT, respiratory_rate: 30, heart_rate: 130, mobility: 'stretcher_immobile' }).target_minutes, 0); // TEWS 8 -> red
});

// ── Clinical sign precedence: emergency signs bypass TEWS ─────────────────────
test('an emergency clinical sign makes the patient Red even with normal vitals', () => {
  const r = urgentSigns(NEUTRAL_ADULT, ['not_breathing']);
  assert.equal(r.colour, 'red');
  assert.equal(r.urgency, 'critical');
  assert.equal(r.target_minutes, 0);
  assert.equal(r.needs_more_data, false);
});

test('the most urgent of (sign category, TEWS) wins', () => {
  // Normal vitals (green) + a very-urgent sign -> orange, not green.
  const r = urgentSigns(NEUTRAL_ADULT, ['severe_pain']);
  assert.equal(r.colour, 'orange');
});

test('SpO2 below 92% is treated as an emergency sign and sourced', () => {
  const r = assess({ ...NEUTRAL_ADULT, spo2: 88 });
  assert.equal(r.colour, 'red');
  assert.ok(r.clinical_signs.some((s) => s.code === 'spo2_below_92' && s.ref.includes('p.15')));
});

test('unknown clinical signs are reported, not silently trusted', () => {
  const r = urgentSigns(NEUTRAL_ADULT, ['definitely_dying']);
  assert.deepEqual(r.unknown_signs, ['definitely_dying']);
  assert.equal(r.colour, 'green');
});

// ── Missing / implausible data handling ───────────────────────────────────────
test('missing vitals lower confidence and are listed for the nurse', () => {
  const r = assess({ ageYears: 30, heart_rate: 80, avpu: 'alert' });
  assert.ok(r.missing_data.includes('respiratory_rate'));
  assert.ok(r.missing_data.includes('systolic_bp'));
  assert.ok(['medium', 'low'].includes(r.confidence));
});

test('implausible readings are not scored and are surfaced for re-measurement', () => {
  const r = assess({ ...NEUTRAL_ADULT, temperature_c: 50 });
  assert.equal(r.tews.breakdown.find((b) => b.vital === 'temperature_c'), undefined);
  assert.deepEqual(r.implausible_data, [{ vital: 'temperature_c', value: 50 }]);
  assert.equal(r.confidence, 'low');
});

test('with no data at all the assessment says it needs more data', () => {
  const r = assess({});
  assert.equal(r.needs_more_data, true);
  assert.equal(r.confidence, 'low');
});

// ── A worked multi-vital example ──────────────────────────────────────────────
test('worked example: septic adult scores Red', () => {
  const r = assess({
    ageYears: 42,
    mobility: 'with_help',
    respiratory_rate: 30,   // 3
    heart_rate: 115,        // 2
    systolic_bp: 88,        // 1
    temperature_c: 39.5,    // 2
    avpu: 'reacts_to_voice',// 1
    trauma: false,          // 0  (mobility 1)
  });
  assert.equal(r.tews.total, 10);
  assert.equal(r.colour, 'red');
  assert.equal(r.variant, 'adult');
});
