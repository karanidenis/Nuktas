'use strict';

/**
 * Deterministic SATS (South African Triage Scale) scoring.
 *
 * ⚠️  THIS MODULE IS INTENTIONALLY NOT AN LLM.
 * The triage priority is computed in plain, auditable code from published
 * thresholds. The language model may *collect* symptoms and *propose* which
 * clinical signs are present, but every priority level produced here is
 * traceable to a row in a published table. A priority level with no source is
 * worse than no priority level at all (challenge rule).
 *
 * PRIMARY SOURCE
 *   South African Triage Scale (SATS) Training Manual 2012, Emergency Medicine
 *   Society of South Africa (EMSSA). emssa.org.za
 *   - Adult TEWS .......... Figure 14 (p.26)   "older than 12 years / taller than 150 cm"
 *   - Older child TEWS .... Figure 13 (p.25)   "3 to 12 years / 95 to 150 cm"
 *   - Younger child TEWS .. Figure 12 (p.24)   "younger than 3 years / smaller than 95 cm"
 *   - Priority thresholds . SATS process flowchart (p.10-11)
 *   - Target times ........ SATS terminology (Red immediate, Orange <10 min,
 *                           Yellow <60 min, Green <240 min)
 *
 * The priority *colour* uses the published SATS categories. Nuktas stores the
 * four-colour scale in the clinic's existing urgency vocabulary:
 *   Red    -> critical
 *   Orange -> high
 *   Yellow -> medium
 *   Green  -> low
 */

const SATS_SOURCE = Object.freeze({
  scale: 'SATS',
  version: '2012 (EMSSA Training Manual)',
  publisher: 'Emergency Medicine Society of South Africa',
  url: 'https://emssa.org.za/wp-content/uploads/2011/04/SATS-Manual-A5-LR-spreadss.pdf',
  figures: {
    adultTews: 'Figure 14 (p.26)',
    olderChildTews: 'Figure 13 (p.25)',
    youngerChildTews: 'Figure 12 (p.24)',
    flowchart: 'SATS process flowchart (p.10-11)',
  },
});

// ── Published SATS target times (minutes) ─────────────────────────────────────
const COLOUR_META = Object.freeze({
  red:    { urgency: 'critical', targetMinutes: 0,   label: 'Emergency (Red)',    guidance: 'Seen immediately — resuscitation area.' },
  orange: { urgency: 'high',     targetMinutes: 10,  label: 'Very urgent (Orange)', guidance: 'Intervention within 10 minutes.' },
  yellow: { urgency: 'medium',   targetMinutes: 60,  label: 'Urgent (Yellow)',    guidance: 'Intervention within 60 minutes.' },
  green:  { urgency: 'low',      targetMinutes: 240, label: 'Routine (Green)',    guidance: 'Intervention within 240 minutes (4 hours).' },
});

const SEVERITY = { green: 1, yellow: 2, orange: 3, red: 4 };

// ── Published clinical precedence signs ───────────────────────────────────────
// A curated, cited subset of the SATS "clinical signs" tables. The agent may
// propose that a sign is present from the conversation; this catalogue decides
// what it is worth. `emergency` signs bypass TEWS entirely and make the patient
// Red (the manual is explicit: "if a patient has any emergency signs then a
// TEWS does NOT need to be calculated").
const SIGN_CATALOG = Object.freeze({
  // ── Adult emergency signs (p.13) / paediatric ABC-c-c-DO (p.15) ──
  not_breathing:          { colour: 'red',   label: 'Not breathing / obstructed airway', ref: 'Emergency signs (p.13, p.15)' },
  cardiac_arrest:         { colour: 'red',   label: 'Cardiac arrest',                    ref: 'Emergency signs (p.13)' },
  current_seizure:        { colour: 'red',   label: 'Convulsing / current seizure',       ref: 'Emergency signs (p.13)' },
  unconscious:            { colour: 'red',   label: 'AVPU: responds only to Pain or Unresponsive', ref: 'Emergency signs (p.13, p.15)' },
  hypoglycaemia:          { colour: 'red',   label: 'Glucose < 3 mmol/L',                 ref: 'Emergency signs (p.13, p.15)' },
  facial_inhalation_burn: { colour: 'red',   label: 'Facial / inhalation burn',           ref: 'Emergency signs (p.13, p.15)' },
  central_cyanosis:       { colour: 'red',   label: 'Central cyanosis',                   ref: 'Paediatric emergency signs (p.15)' },
  severe_resp_distress:   { colour: 'red',   label: 'Severe respiratory distress',        ref: 'Paediatric emergency signs (p.15)' },
  uncontrolled_bleeding:  { colour: 'red',   label: 'Uncontrolled bleeding (not nosebleed)', ref: 'Paediatric emergency signs (p.15)' },
  purpuric_rash:          { colour: 'red',   label: 'Purpuric rash',                      ref: 'Paediatric emergency signs (p.15)' },

  // ── Very urgent signs ──
  reduced_consciousness:  { colour: 'orange', label: 'Reduced level of consciousness / confused', ref: 'Very urgent signs (p.13)' },
  severe_mechanism:       { colour: 'orange', label: 'High-energy transfer / severe mechanism',   ref: 'Very urgent signs (p.13)' },
  threatened_limb:        { colour: 'orange', label: 'Threatened limb',                  ref: 'Very urgent signs (p.13)' },
  severe_pain:            { colour: 'orange', label: 'Severe pain',                      ref: 'SATS terminology (p.3)' },
  poisoning_overdose:     { colour: 'orange', label: 'Poisoning or overdose',            ref: 'Very urgent signs (p.13)' },
  burns_over_10pct:       { colour: 'orange', label: 'Burns >= 10% body surface area',   ref: 'Very urgent signs (p.13)' },
  open_fracture:          { colour: 'orange', label: 'Open / threatened fracture',       ref: 'Very urgent signs (p.13)' },
  large_joint_dislocation:{ colour: 'orange', label: 'Dislocation of a larger joint',    ref: 'Very urgent signs (p.13)' },
  focal_neurology:        { colour: 'orange', label: 'Acute focal neurology',            ref: 'Very urgent signs (p.13)' },
  eye_injury:             { colour: 'orange', label: 'Eye injury',                       ref: 'Very urgent signs (p.13)' },
  unable_to_drink:        { colour: 'orange', label: 'Unable to drink/feed or vomits everything', ref: 'Paediatric very urgent signs (p.15)' },
  malnutrition_severe:    { colour: 'orange', label: 'Severe wasting / oedematous malnutrition', ref: 'Paediatric very urgent signs (p.15)' },
  tiny_baby:              { colour: 'orange', label: 'Tiny baby (< 2 months)',           ref: 'Paediatric very urgent signs (p.15)' },

  // ── Urgent signs ──
  controlled_haemorrhage:{ colour: 'yellow', label: 'Haemorrhage — controlled',          ref: 'Urgent signs (p.13)' },
  abdominal_pain:         { colour: 'yellow', label: 'Abdominal pain',                    ref: 'Urgent signs (p.13)' },
  vomiting_dehydration:   { colour: 'yellow', label: 'Vomiting with dehydration',         ref: 'Urgent signs (p.15)' },
  closed_fracture:        { colour: 'yellow', label: 'Closed fracture',                   ref: 'Urgent signs (p.13, p.15)' },
  minor_burn:             { colour: 'yellow', label: 'Burn < 10% body surface area',      ref: 'Urgent signs (p.15)' },
  digit_dislocation:      { colour: 'yellow', label: 'Dislocation of finger or toe',      ref: 'Urgent signs (p.15)' },
});

// ── Published TEWS lookup tables ──────────────────────────────────────────────
// Every row below is copied verbatim from the named figure. `max` is inclusive.
const TEWS = Object.freeze({
  adult: {
    label: 'Adult TEWS (older than 12 years / taller than 150 cm)',
    figure: SATS_SOURCE.figures.adultTews,
    hasSbp: true,
    mobility: { walking: 0, with_help: 1, stretcher_immobile: 2, wheelchair: 2 },
    rr:  [ { max: 8,        points: 2, label: '< 9' },   { max: 14,       points: 0, label: '9 – 14' },
           { max: 20,       points: 1, label: '15 – 20' }, { max: 29,       points: 2, label: '21 – 29' },
           { max: Infinity, points: 3, label: '> 29' } ],
    hr:  [ { max: 40,       points: 2, label: '< 41' },  { max: 50,       points: 1, label: '41 – 50' },
           { max: 100,      points: 0, label: '51 – 100' }, { max: 110,      points: 1, label: '101 – 110' },
           { max: 129,      points: 2, label: '111 – 129' }, { max: Infinity, points: 3, label: '> 129' } ],
    sbp: [ { max: 70,       points: 3, label: '< 71' },  { max: 80,       points: 2, label: '71 – 80' },
           { max: 100,      points: 1, label: '81 – 100' }, { max: 199,      points: 0, label: '101 – 199' },
           { max: Infinity, points: 2, label: '> 199' } ],
    avpu: { alert: 0, confused: 2, reacts_to_voice: 1, reacts_to_pain: 2, unresponsive: 3 },
  },
  older_child: {
    label: 'Older child TEWS (3 to 12 years / 95 to 150 cm)',
    figure: SATS_SOURCE.figures.olderChildTews,
    hasSbp: false,
    mobility: { normal: 0, unable: 2 },
    rr:  [ { max: 14,       points: 3, label: '< 15' },  { max: 16,       points: 2, label: '15 – 16' },
           { max: 21,       points: 0, label: '17 – 21' }, { max: 26,       points: 1, label: '22 – 26' },
           { max: Infinity, points: 2, label: '27 or more' } ],
    hr:  [ { max: 59,       points: 3, label: '< 60' },  { max: 79,       points: 2, label: '60 – 79' },
           { max: 99,       points: 0, label: '80 – 99' }, { max: 129,      points: 1, label: '100 – 129' },
           { max: Infinity, points: 2, label: '130 or more' } ],
    avpu: { alert: 0, confused: 2, reacts_to_voice: 1, reacts_to_pain: 2, unresponsive: 3 },
  },
  younger_child: {
    label: 'Younger child TEWS (younger than 3 years / smaller than 95 cm)',
    figure: SATS_SOURCE.figures.youngerChildTews,
    hasSbp: false,
    mobility: { normal: 0, unable: 2 },
    rr:  [ { max: 19,       points: 3, label: '< 20' },  { max: 25,       points: 2, label: '20 – 25' },
           { max: 39,       points: 0, label: '26 – 39' }, { max: 49,       points: 2, label: '40 – 49' },
           { max: Infinity, points: 3, label: '50 or more' } ],
    hr:  [ { max: 69,       points: 3, label: '< 70' },  { max: 79,       points: 2, label: '70 – 79' },
           { max: 130,      points: 0, label: '80 – 130' }, { max: 159,      points: 2, label: '131 – 159' },
           { max: Infinity, points: 3, label: '160 or more' } ],
    avpu: { alert: 0, reacts_to_voice: 1, reacts_to_pain: 2, unresponsive: 3 },
  },
});

// Temperature is scored 0 or 2 only (manual, p.24: "for temperature it is only
// possible to score 0 or 2 points"). We return a labelled bucket so the
// evidence shows the exact range that fired.
function tempPoints(tempC) {
  if (tempC == null) return null;
  if (tempC < 35)      return { points: 2, label: '< 35 °C (cold)' };
  if (tempC <= 38.4)   return { points: 0, label: '35 – 38.4 °C' };
  return { points: 2, label: '> 38.4 °C (hot)' };
}

// Plausibility bounds used to catch transcription / device errors before we
// score on them. A value outside these bounds is NOT scored; it is reported as
// conflicting data for a human to resolve. (Examples: a wet thermometer, a
// mis-keyed value, a machine default.)
const PLAUSIBLE = Object.freeze({
  rr:    { min: 4,   max: 80 },
  hr:    { min: 20,  max: 260 },
  sbp:   { min: 40,  max: 300 },
  tempC: { min: 28,  max: 43.5 },
  spo2:  { min: 50,  max: 100 },
});

function inRange(value, bounds) {
  return value != null && value >= bounds.min && value <= bounds.max;
}

/**
 * Pick the correct published TEWS variant. The manual: younger child is
 * <3 years or <95 cm; older child is 3-12 years or 95-150 cm; adult is
 * >12 years or >150 cm. When both age and height are available the height
 * rule wins for edge cases, matching the manual.
 */
function selectBand({ ageYears, age_years, heightCm, height_cm } = {}) {
  const age = ageYears ?? age_years;
  const height = heightCm ?? height_cm;
  if (height != null) {
    if (height < 95) return 'younger_child';
    if (height <= 150) return 'older_child';
    return 'adult';
  }
  if (age != null) {
    if (age < 3) return 'younger_child';
    if (age <= 12) return 'older_child';
    return 'adult';
  }
  return null;
}

function pickRange(table, value) {
  for (const row of table) {
    if (value <= row.max) return row;
  }
  return null;
}

/**
 * Score the TEWS for a set of vitals.
 * @returns {{ variant, label, figure, total, breakdown, missing, implausible }}
 */
function scoreTews(vitals = {}, band) {
  const variant = band || selectBand(vitals);
  if (!variant) {
    return {
      variant: null,
      total: null,
      breakdown: [],
      missing: ['age_or_height'],
      implausible: [],
      reason: 'Cannot choose a TEWS variant without age or height.',
    };
  }

  const table = TEWS[variant];
  const breakdown = [];
  const missing = [];
  const implausible = [];
  let total = 0;

  const add = (vital, value, points, label, ref) => {
    if (value == null || points == null) {
      missing.push(vital);
      return;
    }
    total += points;
    breakdown.push({ vital, value, points, range: label, source: ref });
  };

  // Mobility
  if (vitals.mobility != null) {
    const pts = table.mobility[vitals.mobility];
    if (pts == null) missing.push('mobility');
    else add('mobility', vitals.mobility, pts, vitals.mobility, table.figure);
  } else missing.push('mobility');

  // Respiratory rate
  if (vitals.respiratory_rate != null) {
    if (inRange(vitals.respiratory_rate, PLAUSIBLE.rr)) {
      const row = pickRange(table.rr, vitals.respiratory_rate);
      add('respiratory_rate', vitals.respiratory_rate, row.points, row.label, table.figure);
    } else implausible.push({ vital: 'respiratory_rate', value: vitals.respiratory_rate });
  } else missing.push('respiratory_rate');

  // Heart rate
  if (vitals.heart_rate != null) {
    if (inRange(vitals.heart_rate, PLAUSIBLE.hr)) {
      const row = pickRange(table.hr, vitals.heart_rate);
      add('heart_rate', vitals.heart_rate, row.points, row.label, table.figure);
    } else implausible.push({ vital: 'heart_rate', value: vitals.heart_rate });
  } else missing.push('heart_rate');

  // Systolic BP — adult only; the manual explicitly does not recommend BP in children.
  if (table.hasSbp) {
    if (vitals.systolic_bp != null) {
      if (inRange(vitals.systolic_bp, PLAUSIBLE.sbp)) {
        const row = pickRange(table.sbp, vitals.systolic_bp);
        add('systolic_bp', vitals.systolic_bp, row.points, row.label, table.figure);
      } else implausible.push({ vital: 'systolic_bp', value: vitals.systolic_bp });
    } else missing.push('systolic_bp');
  }

  // Temperature
  if (vitals.temperature_c != null) {
    if (inRange(vitals.temperature_c, PLAUSIBLE.tempC)) {
      const t = tempPoints(vitals.temperature_c);
      add('temperature_c', vitals.temperature_c, t.points, t.label, table.figure);
    } else implausible.push({ vital: 'temperature_c', value: vitals.temperature_c });
  } else missing.push('temperature_c');

  // AVPU
  if (vitals.avpu != null) {
    const pts = table.avpu[vitals.avpu];
    if (pts == null) missing.push('avpu');
    else add('avpu', vitals.avpu, pts, vitals.avpu, table.figure);
  } else missing.push('avpu');

  // Trauma (any injury in the past 48 hours) — scores 1 when present.
  if (vitals.trauma != null) {
    add('trauma', vitals.trauma, vitals.trauma ? 1 : 0, vitals.trauma ? 'Yes' : 'No', table.figure);
  } else missing.push('trauma');

  // SpO2 is not part of the 2012 TEWS; it is an "additional investigation" that
  // can raise priority (p.3, p.17). We surface it separately rather than score it.
  const spo2 = vitals.spo2;
  const spo2Concern = spo2 != null && spo2 < 92;

  return {
    variant,
    label: table.label,
    figure: table.figure,
    total,
    breakdown,
    missing,
    implausible,
    spo2,
    spo2Concern,
  };
}

/** Colour implied by a raw TEWS total (flowchart, p.10-11). */
function colourFromTews(total) {
  if (total == null) return null;
  if (total >= 7) return 'red';
  if (total >= 5) return 'orange';
  if (total >= 3) return 'yellow';
  return 'green';
}

function mostUrgent(...colours) {
  return colours
    .filter(Boolean)
    .sort((a, b) => SEVERITY[b] - SEVERITY[a])[0] || null;
}

/**
 * Full SATS assessment.
 *
 * @param {object} vitals  { ageYears, heightCm, mobility, respiratory_rate,
 *                           heart_rate, systolic_bp, temperature_c, avpu,
 *                           trauma, spo2 }
 * @param {object} [opts]  { clinicalSigns: string[] }  codes from SIGN_CATALOG
 * @returns {object} assessment with an auditable evidence trail
 */
function assess(vitals = {}, opts = {}) {
  const proposedSigns = Array.isArray(opts.clinicalSigns) ? opts.clinicalSigns : [];

  const knownSigns = [];
  const unknownSigns = [];
  for (const code of proposedSigns) {
    const sign = SIGN_CATALOG[code];
    if (sign) knownSigns.push({ code, ...sign });
    else unknownSigns.push(code);
  }

  const signColour = mostUrgent(...knownSigns.map((s) => s.colour));
  const tews = scoreTews(vitals, selectBand(vitals));
  const tewsColour = colourFromTews(tews.total);

  // SpO2 < 92% is a paediatric emergency sign (p.15) and an additional
  // investigation that can change priority (p.3, p.17). We treat it as a Red
  // floor for all ages and record the source.
  const spo2Emergency = tews.spo2Concern;
  if (spo2Emergency) {
    knownSigns.push({ code: 'spo2_below_92', colour: 'red', label: 'SpO2 < 92% in room air', ref: 'Emergency sign / additional investigation (p.15, p.17)' });
  }

  const finalColour = mostUrgent(signColour, spo2Emergency ? 'red' : null, tewsColour) || 'green';
  const meta = COLOUR_META[finalColour];

  // Confidence: a full TEWS with all required vitals is high. Missing vitals or
  // implausible readings lower it so the nurse knows where to look. Clinical
  // signs alone (no vitals) are still actionable but marked medium.
  const requiredCount = tews.variant === 'adult' ? 7 : 6;
  const presentCount = tews.variant == null ? 0 : requiredCount - tews.missing.length;
  let confidence = 'high';
  if (tews.total == null) confidence = 'low';
  else if (presentCount === 0) confidence = 'low';
  else if (tews.missing.length > 0) confidence = 'medium';
  if (tews.implausible.length > 0) confidence = 'low';

  const unknownRequired = tews.missing.filter((m) => m !== 'trauma'); // trauma is commonly unrecorded
  if (unknownRequired.length > 0 && confidence === 'high') confidence = 'medium';

  const rationaleParts = [];
  if (knownSigns.length) {
    rationaleParts.push(`Clinical sign(s): ${knownSigns.map((s) => s.label).join('; ')}.`);
  }
  if (tews.total != null) {
    rationaleParts.push(`TEWS ${tews.total} (${tews.label}) → ${tewsColour?.toUpperCase()} by the SATS flowchart.`);
  }
  if (finalColour !== (tewsColour || signColour)) {
    rationaleParts.push(`Final priority set by the most urgent of the clinical-sign category and the TEWS.`);
  }
  if (tews.missing.length) {
    rationaleParts.push(`Missing observations reduce certainty: ${tews.missing.join(', ')}.`);
  }
  if (tews.implausible.length) {
    rationaleParts.push(`Implausible reading(s) not scored, please re-measure: ${tews.implausible.map((i) => `${i.vital}=${i.value}`).join(', ')}.`);
  }

  return {
    scale: SATS_SOURCE.scale,
    scale_version: SATS_SOURCE.version,
    source: SATS_SOURCE,
    variant: tews.variant,
    variant_label: tews.label,
    tews: {
      total: tews.total,
      breakdown: tews.breakdown,
      figure: tews.figure,
    },
    clinical_signs: knownSigns,
    unknown_signs: unknownSigns,
    spo2: tews.spo2,
    colour: finalColour,
    urgency: meta.urgency,
    target_minutes: meta.targetMinutes,
    colour_label: meta.label,
    guidance: meta.guidance,
    confidence,
    missing_data: tews.missing,
    implausible_data: tews.implausible,
    rationale: rationaleParts.join(' ') || 'No observations or clinical signs supplied.',
    // If we could not do anything at all, say so plainly.
    needs_more_data: tews.total == null && knownSigns.length === 0,
  };
}

module.exports = {
  SATS_SOURCE,
  COLOUR_META,
  SIGN_CATALOG,
  TEWS,
  PLAUSIBLE,
  SEVERITY,
  selectBand,
  scoreTews,
  colourFromTews,
  assess,
};
