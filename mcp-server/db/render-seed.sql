-- Synthetic records for the public hackathon MCP endpoint.
-- Stable UUIDs make the judge instructions reproducible across restarts.

INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-4000-8000-000000000001', 'Nuktas Judge Sandbox', 'nuktas-judge-sandbox')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO clinics (id, organization_id, name, code, location, phone_number)
VALUES (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'Nairobi Central Clinic — Synthetic Sandbox',
  'JUDGE-NC',
  'Synthetic demonstration environment',
  '+254700000000'
)
ON CONFLICT (code) DO UPDATE
SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name;

INSERT INTO departments (id, clinic_id, name, code, is_emergency, avg_wait_time, staff_available)
VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'Emergency', 'EMRG', true, 0, 2),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 'Internal Medicine', 'INTM', false, 45, 2)
ON CONFLICT (clinic_id, code) DO UPDATE
SET name = EXCLUDED.name, is_emergency = EXCLUDED.is_emergency;

INSERT INTO users (id, clinic_id, name, email, password_hash, role, department_id)
VALUES (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000101',
  'Dr. Amina Njeri (Synthetic)',
  'judge-clinician@nuktas.invalid',
  'not-a-login-account',
  'doctor',
  '00000000-0000-4000-8000-000000000201'
)
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO patients (
  id, phone_number, name, chronic_conditions, preferred_language,
  consent_given, visit_count, age_years, sex
)
VALUES (
  '00000000-0000-4000-8000-000000000401',
  '+254700000401',
  'Amina Sample Patient',
  ARRAY['hypertension'],
  'sw', true, 2, 54, 'female'
)
ON CONFLICT (phone_number) DO UPDATE
SET name = EXCLUDED.name, chronic_conditions = EXCLUDED.chronic_conditions,
    age_years = EXCLUDED.age_years, sex = EXCLUDED.sex;

INSERT INTO calls (
  id, patient_id, clinic_id, language_code, chief_complaint, symptoms,
  red_flag_detected, urgency_tier, recommended_department,
  consent_given, call_status, agent_summary
)
VALUES (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000101',
  'sw', 'Severe chest pain and shortness of breath',
  ARRAY['chest pain', 'shortness of breath'], true, 'critical', 'Emergency',
  true, 'completed', 'Synthetic patient with a red-flag presentation for judge testing.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO queue_entries (
  id, call_id, clinic_id, department_id, patient_id, queue_number,
  urgency_tier, position_in_queue, status, estimated_wait_time
)
VALUES (
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000401',
  'JUDGE-EMRG-001', 'critical', 1, 'waiting', 0
)
ON CONFLICT (queue_number) DO NOTHING;

INSERT INTO vitals (
  id, clinic_id, patient_id, queue_entry_id, recorded_by_name, source,
  respiratory_rate, heart_rate, systolic_bp, diastolic_bp,
  temperature_c, spo2, avpu, mobility, trauma, age_years, notes
)
VALUES (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000601',
  'Dr. Amina Njeri (Synthetic)', 'staff_entry',
  30, 118, 92, 61, 37.2, 89, 'alert', 'walking', false, 54,
  'Synthetic observations for the public judge sandbox.'
)
ON CONFLICT (id) DO NOTHING;
