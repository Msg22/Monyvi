-- Add AI processing consent metadata to profiles.
-- Stores version, consent timestamp, and optional revocation timestamp.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_processing_consent JSONB NULL;

COMMENT ON COLUMN public.profiles.ai_processing_consent
  IS 'AI processing consent metadata: version, consentedAt, and revokedAt.';
