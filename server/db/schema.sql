-- Nuktas Database Schema
-- Run: psql $DATABASE_URL -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Core Tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR NOT NULL,
  code        VARCHAR NOT NULL UNIQUE,
  location    VARCHAR,
  phone_number VARCHAR,
  timezone    VARCHAR DEFAULT 'Africa/Nairobi',
  is_active   BOOLEAN DEFAULT true,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name            VARCHAR NOT NULL,
  code            VARCHAR NOT NULL,
  status          VARCHAR DEFAULT 'open',       -- open | busy | closed
  staff_available INTEGER DEFAULT 1,
  avg_wait_time   INTEGER DEFAULT 30,           -- minutes
  specialties     TEXT[]  DEFAULT '{}',
  is_emergency    BOOLEAN DEFAULT false,
  inserted_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, code)
);

CREATE TABLE IF NOT EXISTS users (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name                     VARCHAR NOT NULL,
  email                    VARCHAR NOT NULL UNIQUE,
  password_hash            VARCHAR NOT NULL,
  role                     VARCHAR DEFAULT 'staff',  -- staff | admin | doctor
  department_id            UUID REFERENCES departments(id) ON DELETE SET NULL,
  phone_number             VARCHAR,
  is_active                BOOLEAN DEFAULT true,
  notification_preferences JSONB DEFAULT '{}',
  inserted_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number       VARCHAR NOT NULL UNIQUE,
  name               VARCHAR,
  location           VARCHAR,
  insurance_provider VARCHAR,
  chronic_conditions TEXT[]  DEFAULT '{}',
  preferred_language VARCHAR DEFAULT 'sw',
  consent_given      BOOLEAN DEFAULT false,
  consent_timestamp  TIMESTAMPTZ,
  consent_revoked    BOOLEAN DEFAULT false,
  no_show_count      INTEGER DEFAULT 0,
  visit_count        INTEGER DEFAULT 0,
  inserted_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calls (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id             UUID NOT NULL REFERENCES patients(id),
  clinic_id              UUID NOT NULL REFERENCES clinics(id),
  twilio_call_sid        VARCHAR,
  language_code          VARCHAR DEFAULT 'sw',
  call_duration          INTEGER,               -- seconds
  call_transcript        TEXT,
  chief_complaint        VARCHAR,
  symptoms               TEXT[]  DEFAULT '{}',
  red_flag_detected      BOOLEAN DEFAULT false,
  red_flag_details       VARCHAR,
  urgency_tier           VARCHAR,               -- critical | high | medium | low
  recommended_department VARCHAR,
  secondary_departments  TEXT[]  DEFAULT '{}',
  queue_number           VARCHAR,
  appointment_time       TIMESTAMPTZ,
  consent_given          BOOLEAN DEFAULT false,
  call_status            VARCHAR DEFAULT 'in_progress',  -- in_progress | completed | failed
  agent_summary          TEXT,
  inserted_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id                     UUID NOT NULL REFERENCES calls(id),
  clinic_id                   UUID NOT NULL REFERENCES clinics(id),
  department_id               UUID NOT NULL REFERENCES departments(id),
  patient_id                  UUID NOT NULL REFERENCES patients(id),
  queue_number                VARCHAR NOT NULL UNIQUE,
  urgency_tier                VARCHAR NOT NULL,
  position_in_queue           INTEGER,
  status                      VARCHAR DEFAULT 'waiting',  -- waiting | checked_in | in_progress | completed | no_show
  estimated_wait_time         INTEGER,                    -- minutes
  critical_alert_acknowledged BOOLEAN DEFAULT false,
  acknowledged_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at             TIMESTAMPTZ,
  checked_in_at               TIMESTAMPTZ,
  in_progress_at              TIMESTAMPTZ,
  completed_at                TIMESTAMPTZ,
  notes                       TEXT,
  inserted_at                 TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS followup_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id UUID NOT NULL REFERENCES queue_entries(id) ON DELETE CASCADE,
  to_phone       VARCHAR NOT NULL,
  message        VARCHAR(160) NOT NULL,
  sent_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at        TIMESTAMPTZ DEFAULT NOW(),
  inserted_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(queue_entry_id, message)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_queue_clinic_status   ON queue_entries(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_dept_status     ON queue_entries(department_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_urgency         ON queue_entries(urgency_tier);
CREATE INDEX IF NOT EXISTS idx_queue_patient         ON queue_entries(patient_id);
CREATE INDEX IF NOT EXISTS idx_calls_patient         ON calls(patient_id);
CREATE INDEX IF NOT EXISTS idx_calls_clinic          ON calls(clinic_id);
CREATE INDEX IF NOT EXISTS idx_calls_twilio          ON calls(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_users_clinic          ON users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_phone        ON patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_followup_queue_entry  ON followup_messages(queue_entry_id);

-- ── Hospitals ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hospitals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR NOT NULL,
  district     VARCHAR NOT NULL,
  province     VARCHAR NOT NULL,
  address      VARCHAR,
  phone_number VARCHAR,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  specialties  TEXT[]  DEFAULT '{}',
  is_emergency BOOLEAN DEFAULT false,
  is_active    BOOLEAN DEFAULT true,
  inserted_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hospitals_district ON hospitals(district);
CREATE INDEX IF NOT EXISTS idx_hospitals_coords   ON hospitals(latitude, longitude);

-- ─────────────────────────────────────────────────────────────────────────────
-- Nuktas agentic-triage additions
-- Everything below supports the governed agent workflow: observations, the
-- agent's evidence-backed recommendation, the named-clinician approval gate,
-- and the append-only audit trail. All statements are idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- Organizations (a clinic belongs to exactly one organization). Triage tools
-- are scoped to the clinic, and the clinic's organization, on every call.
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR NOT NULL,
  slug        VARCHAR NOT NULL UNIQUE,
  is_active   BOOLEAN DEFAULT true,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Patient attributes needed to choose the correct SATS/TEWS variant.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS age_years  INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS height_cm  NUMERIC;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sex        VARCHAR;
-- East African default intake language.
ALTER TABLE patients ALTER COLUMN preferred_language SET DEFAULT 'sw';

-- Vital-sign observations. One row per measurement set.
CREATE TABLE IF NOT EXISTS vitals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id         UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  queue_entry_id     UUID REFERENCES queue_entries(id) ON DELETE SET NULL,
  recorded_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_by_name   VARCHAR,
  source             VARCHAR NOT NULL DEFAULT 'staff_entry',  -- staff_entry | voice | asr | device
  respiratory_rate   NUMERIC,
  heart_rate         NUMERIC,
  systolic_bp        NUMERIC,
  diastolic_bp       NUMERIC,
  temperature_c      NUMERIC,
  spo2               NUMERIC,
  avpu               VARCHAR,   -- alert | confused | reacts_to_voice | reacts_to_pain | unresponsive
  mobility           VARCHAR,   -- walking | with_help | stretcher_immobile | wheelchair | normal | unable
  trauma             BOOLEAN,
  age_years          NUMERIC,
  height_cm          NUMERIC,
  notes              TEXT,
  recorded_at        TIMESTAMPTZ DEFAULT NOW(),
  inserted_at        TIMESTAMPTZ DEFAULT NOW()
);

-- The agent's recommendation. Created with status='pending'; it NEVER changes a
-- patient's queue position on its own. `evidence` carries the vitals snapshot
-- and the exact published thresholds that fired.
CREATE TABLE IF NOT EXISTS triage_assessments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id               UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  queue_entry_id           UUID REFERENCES queue_entries(id) ON DELETE SET NULL,
  vitals_id                UUID REFERENCES vitals(id) ON DELETE SET NULL,
  agent_run_id             UUID,
  kind                     VARCHAR NOT NULL DEFAULT 'initial',  -- initial | deterioration
  scale                    VARCHAR NOT NULL DEFAULT 'SATS',
  scale_version            VARCHAR,
  variant                  VARCHAR,
  tews_score               INTEGER,
  tews_breakdown           JSONB DEFAULT '[]',
  clinical_signs           JSONB DEFAULT '[]',
  recommended_urgency      VARCHAR NOT NULL,   -- critical | high | medium | low
  sats_colour              VARCHAR NOT NULL,   -- red | orange | yellow | green
  target_minutes           INTEGER,
  recommended_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  recommended_department   VARCHAR,
  rationale                TEXT,
  evidence                 JSONB DEFAULT '{}',
  confidence               VARCHAR DEFAULT 'medium',
  missing_data             TEXT[] DEFAULT '{}',
  needs_more_data          BOOLEAN DEFAULT false,
  status                   VARCHAR NOT NULL DEFAULT 'pending',  -- pending | awaiting_approval | approved | rejected | applied | superseded
  requested_by             VARCHAR DEFAULT 'agent',
  decided_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_by_name          VARCHAR,
  decided_at               TIMESTAMPTZ,
  decision_note            TEXT,
  applied_at               TIMESTAMPTZ,
  inserted_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Agent run log — one row per agent invocation, with every tool call recorded
-- as a step (name, args, result, ok, latency). This is the "logged tool call
-- for every action" requirement and the source of the live run view.
CREATE TABLE IF NOT EXISTS agent_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id     UUID REFERENCES patients(id) ON DELETE SET NULL,
  queue_entry_id UUID REFERENCES queue_entries(id) ON DELETE SET NULL,
  trigger        VARCHAR DEFAULT 'dashboard',   -- voice | asr | dashboard | manual
  language       VARCHAR DEFAULT 'en',
  model          VARCHAR,
  provider       VARCHAR,
  status         VARCHAR DEFAULT 'running',     -- running | awaiting_approval | completed | failed
  input          JSONB DEFAULT '{}',
  steps          JSONB DEFAULT '[]',
  summary        TEXT,
  assessment_id  UUID,
  error          TEXT,
  tokens_in      INTEGER DEFAULT 0,
  tokens_out     INTEGER DEFAULT 0,
  duration_ms    INTEGER,
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  inserted_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill for databases created before `updated_at` was added to agent_runs.
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- The named-clinician approval gate. A recommendation is only applied to the
-- queue when a row here says decision='approved' for that assessment.
CREATE TABLE IF NOT EXISTS approvals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id    UUID NOT NULL REFERENCES triage_assessments(id) ON DELETE CASCADE,
  clinic_id        UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  decision         VARCHAR NOT NULL,            -- approved | rejected
  decided_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_by_name  VARCHAR NOT NULL,
  decided_by_role  VARCHAR,
  note             TEXT,
  inserted_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id)
);

-- Append-only audit trail. Every MCP tool call and every consequential HTTP
-- action writes exactly one row here.
CREATE TABLE IF NOT EXISTS audit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID REFERENCES clinics(id) ON DELETE CASCADE,
  actor_type    VARCHAR NOT NULL,   -- agent | user | system | mcp
  actor_id      UUID,
  actor_name    VARCHAR,
  action        VARCHAR NOT NULL,
  subject_type  VARCHAR,
  subject_id    UUID,
  run_id        UUID,
  payload       JSONB DEFAULT '{}',
  inserted_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vitals_patient          ON vitals(patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_clinic           ON vitals(clinic_id);
CREATE INDEX IF NOT EXISTS idx_assess_clinic_status    ON triage_assessments(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_assess_patient          ON triage_assessments(patient_id);
CREATE INDEX IF NOT EXISTS idx_assess_queue_entry      ON triage_assessments(queue_entry_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_clinic       ON agent_runs(clinic_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_assessment    ON approvals(assessment_id);
CREATE INDEX IF NOT EXISTS idx_audit_clinic            ON audit_events(clinic_id, inserted_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_run               ON audit_events(run_id);
