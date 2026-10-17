-- Add gen_random_uuid() and NOW() defaults to all tables so Node.js
-- code can INSERT without passing id/timestamps explicitly.
-- Safe to run multiple times (ALTER COLUMN SET DEFAULT is idempotent).

ALTER TABLE clinics
  ALTER COLUMN id          SET DEFAULT gen_random_uuid(),
  ALTER COLUMN inserted_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at  SET DEFAULT NOW();

ALTER TABLE departments
  ALTER COLUMN id          SET DEFAULT gen_random_uuid(),
  ALTER COLUMN inserted_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at  SET DEFAULT NOW();

ALTER TABLE users
  ALTER COLUMN id          SET DEFAULT gen_random_uuid(),
  ALTER COLUMN inserted_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at  SET DEFAULT NOW();

ALTER TABLE patients
  ALTER COLUMN id          SET DEFAULT gen_random_uuid(),
  ALTER COLUMN inserted_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at  SET DEFAULT NOW();

ALTER TABLE calls
  ALTER COLUMN id          SET DEFAULT gen_random_uuid(),
  ALTER COLUMN inserted_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at  SET DEFAULT NOW();

ALTER TABLE queue_entries
  ALTER COLUMN id          SET DEFAULT gen_random_uuid(),
  ALTER COLUMN inserted_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at  SET DEFAULT NOW();
