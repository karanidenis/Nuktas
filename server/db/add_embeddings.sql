-- Feature 6: Voice Transcript Search via embeddings
-- Stores OpenAI text-embedding-3-small vectors as JSONB float arrays

CREATE TABLE IF NOT EXISTS call_embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  patient_id  UUID REFERENCES patients(id) ON DELETE SET NULL,
  clinic_id   UUID REFERENCES clinics(id) ON DELETE CASCADE,
  text_chunk  TEXT NOT NULL,
  embedding   JSONB NOT NULL,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS call_embeddings_clinic_idx ON call_embeddings (clinic_id);
CREATE INDEX IF NOT EXISTS call_embeddings_call_idx   ON call_embeddings (call_id);
