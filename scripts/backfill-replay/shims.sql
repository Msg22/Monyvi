-- Harness-only shims for the Metals backfill replay harness
-- (scripts/metals-backfill-replay-harness.js). These mirror Supabase-managed
-- objects that live outside supabase/migrations (roles, auth schema,
-- extensions schema, cron). NEVER applied to a real database; the disposable
-- replay database is dropped when the harness finishes.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;

-- Full GoTrue auth.users column set: pgTAP suites insert full rows.
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id uuid,
  id uuid PRIMARY KEY,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  phone text,
  phone_confirmed_at timestamptz,
  phone_change text,
  phone_change_token varchar(255),
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz,
  email_change_token_current varchar(255),
  email_change_confirm_status smallint,
  banned_until timestamptz,
  reauthentication_token varchar(255),
  reauthentication_sent_at timestamptz,
  is_sso_user boolean,
  deleted_at timestamptz,
  is_anonymous boolean
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- cron stubs: pg_cron can only live in the Supabase-managed postgres
-- database, so the replay database gets no-op scheduling shims.
CREATE SCHEMA IF NOT EXISTS cron;

CREATE TABLE IF NOT EXISTS cron.job (
  jobname text PRIMARY KEY
);

CREATE OR REPLACE FUNCTION cron.schedule(
  p_jobname text,
  p_schedule text,
  p_command text
)
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT 0::bigint
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(p_jobname text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT true
$$;
