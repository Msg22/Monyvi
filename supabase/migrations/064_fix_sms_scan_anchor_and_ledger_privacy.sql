-- Keep one immutable server-accepted scan window and remove committed raw
-- fingerprints from the allowance ledger.

CREATE TABLE IF NOT EXISTS public.sms_ai_scan_sessions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_session_id text NOT NULL,
  scan_kind text NOT NULL,
  client_scan_started_at timestamptz NOT NULL,
  accepted_scan_started_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scan_session_id),
  CONSTRAINT sms_ai_scan_sessions_id_not_blank
    CHECK (length(btrim(scan_session_id)) BETWEEN 1 AND 160),
  CONSTRAINT sms_ai_scan_sessions_kind
    CHECK (scan_kind IN ('initial', 'incremental', 'history'))
);

CREATE INDEX IF NOT EXISTS sms_ai_scan_sessions_cleanup
  ON public.sms_ai_scan_sessions (updated_at);

ALTER TABLE public.sms_ai_scan_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_ai_scan_sessions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sms_ai_resolve_scan_window(
  p_user_id uuid,
  p_scan_session_id text,
  p_scan_kind text,
  p_client_scan_started_at timestamptz,
  p_max_future_skew_seconds integer,
  p_edge_grace_seconds integer
)
RETURNS TABLE (accepted_scan_started_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_existing public.sms_ai_scan_sessions%ROWTYPE;
  v_accepted timestamptz;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_resolve_scan_window is service-role only';
  END IF;
  IF p_user_id IS NULL
    OR p_client_scan_started_at IS NULL
    OR p_max_future_skew_seconds < 0
    OR p_edge_grace_seconds < 0
    OR p_scan_kind NOT IN ('initial', 'incremental', 'history', 'live')
    OR (p_scan_kind <> 'live' AND (
      p_scan_session_id IS NULL
      OR length(btrim(p_scan_session_id)) NOT BETWEEN 1 AND 160
    ))
  THEN
    RAISE EXCEPTION 'Invalid SMS scan-window input';
  END IF;
  IF p_client_scan_started_at
    > v_now + make_interval(secs => p_max_future_skew_seconds)
  THEN
    RETURN QUERY SELECT NULL::timestamptz;
    RETURN;
  END IF;

  v_accepted := GREATEST(
    p_client_scan_started_at,
    v_now - make_interval(secs => p_edge_grace_seconds)
  );
  IF p_scan_kind = 'live' THEN
    RETURN QUERY SELECT v_accepted;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':scan:' || p_scan_session_id, 0)
  );
  SELECT * INTO v_existing
  FROM public.sms_ai_scan_sessions
  WHERE user_id = p_user_id AND scan_session_id = p_scan_session_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.scan_kind IS DISTINCT FROM p_scan_kind
      OR v_existing.client_scan_started_at
        IS DISTINCT FROM p_client_scan_started_at
    THEN
      RETURN QUERY SELECT NULL::timestamptz;
      RETURN;
    END IF;
    UPDATE public.sms_ai_scan_sessions
    SET updated_at = v_now
    WHERE user_id = p_user_id AND scan_session_id = p_scan_session_id;
    RETURN QUERY SELECT v_existing.accepted_scan_started_at;
    RETURN;
  END IF;

  INSERT INTO public.sms_ai_scan_sessions (
    user_id,
    scan_session_id,
    scan_kind,
    client_scan_started_at,
    accepted_scan_started_at,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_scan_session_id,
    p_scan_kind,
    p_client_scan_started_at,
    v_accepted,
    v_now,
    v_now
  );
  RETURN QUERY SELECT v_accepted;
END;
$function$;

REVOKE ALL ON FUNCTION public.sms_ai_resolve_scan_window(
  uuid, text, text, timestamptz, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_resolve_scan_window(
  uuid, text, text, timestamptz, integer, integer
) TO service_role;

-- Earlier preview branches may already contain this temporary column. Scrub it
-- and prevent any older reserve function from committing another value.
CREATE OR REPLACE FUNCTION public.scrub_sms_ai_work_request_fingerprints()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.candidate_fingerprints := ARRAY[]::text[];
  RETURN NEW;
END;
$function$;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sms_ai_work_requests'
      AND column_name = 'candidate_fingerprints'
  ) THEN
    UPDATE public.sms_ai_work_requests
    SET candidate_fingerprints = ARRAY[]::text[]
    WHERE cardinality(candidate_fingerprints) > 0;
    DROP TRIGGER IF EXISTS scrub_sms_ai_work_request_fingerprints
      ON public.sms_ai_work_requests;
    CREATE TRIGGER scrub_sms_ai_work_request_fingerprints
      BEFORE INSERT OR UPDATE OF candidate_fingerprints
      ON public.sms_ai_work_requests
      FOR EACH ROW EXECUTE FUNCTION public.scrub_sms_ai_work_request_fingerprints();
  END IF;
END;
$block$;

DROP FUNCTION IF EXISTS public.sms_ai_mark_provider_started_v2(uuid);
DROP FUNCTION IF EXISTS public.sms_ai_mark_provider_started_v2(uuid, text[]);

CREATE OR REPLACE FUNCTION public.sms_ai_mark_provider_started_v3(
  p_request_id uuid,
  p_candidate_fingerprints text[]
)
RETURNS TABLE (
  started boolean,
  decision_code text,
  terminal_fingerprints text[],
  available_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_work public.sms_ai_work_requests%ROWTYPE;
  v_start record;
  v_terminal_fingerprints text[] := ARRAY[]::text[];
  v_history_start timestamptz;
  v_available_at timestamptz;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_mark_provider_started_v3 is service-role only';
  END IF;
  IF p_candidate_fingerprints IS NULL
    OR cardinality(p_candidate_fingerprints) > 50
    OR EXISTS (
      SELECT 1 FROM unnest(p_candidate_fingerprints) AS fingerprint
      WHERE fingerprint !~ '^[0-9a-f]{64}$'
    )
  THEN
    RAISE EXCEPTION 'Invalid SMS AI provider-start fingerprints';
  END IF;

  SELECT * INTO v_work
  FROM public.sms_ai_work_requests
  WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'request_not_found'::text,
      v_terminal_fingerprints, NULL::timestamptz;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_work.user_id::text || ':' || v_work.capability, 0)
  );
  SELECT * INTO v_work
  FROM public.sms_ai_work_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_work.status = 'reserved' AND v_work.capability = 'sms_full_parse' THEN
    SELECT COALESCE(array_agg(outcome.sms_fingerprint), ARRAY[]::text[])
    INTO v_terminal_fingerprints
    FROM public.sms_ai_negative_outcomes AS outcome
    WHERE outcome.user_id = v_work.user_id
      AND outcome.deleted = false
      AND outcome.is_terminal = true
      AND outcome.sms_fingerprint = ANY(p_candidate_fingerprints);

    IF cardinality(v_terminal_fingerprints) > 0 THEN
      UPDATE public.sms_ai_work_requests
      SET status = 'released', decision_code = 'terminal_outcome',
        reservation_expires_at = NULL, updated_at = v_now
      WHERE id = v_work.id;
      RETURN QUERY SELECT false, 'terminal_outcome'::text,
        v_terminal_fingerprints, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  IF v_work.status = 'reserved'
    AND v_work.capability = 'sms_full_parse'
    AND v_work.scan_kind = 'history'
    AND v_work.history_cooldown_seconds > 0
  THEN
    SELECT min(event.started_at) INTO v_history_start
    FROM public.sms_ai_usage_events AS event
    JOIN public.sms_ai_work_requests AS work ON work.id = event.request_id
    WHERE event.user_id = v_work.user_id
      AND event.capability = v_work.capability
      AND work.scan_kind = 'history'
      AND work.scan_session_id IS DISTINCT FROM v_work.scan_session_id
      AND event.started_at > v_now
        - make_interval(secs => v_work.history_cooldown_seconds);

    IF v_history_start IS NOT NULL THEN
      v_available_at := v_history_start
        + make_interval(secs => v_work.history_cooldown_seconds);
      UPDATE public.sms_ai_work_requests
      SET status = 'refused', decision_code = 'history_cooldown',
        available_at = v_available_at,
        reservation_expires_at = NULL,
        updated_at = v_now
      WHERE id = v_work.id;
      RETURN QUERY SELECT false, 'history_cooldown'::text,
        v_terminal_fingerprints, v_available_at;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_start
  FROM public.sms_ai_mark_provider_started(p_request_id);
  RETURN QUERY SELECT v_start.started, v_start.decision_code,
    v_terminal_fingerprints, NULL::timestamptz;
END;
$function$;

REVOKE ALL ON FUNCTION public.sms_ai_mark_provider_started_v3(uuid, text[])
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_mark_provider_started_v3(uuid, text[])
TO service_role;

SELECT cron.unschedule('sms-ai-scan-session-cleanup') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sms-ai-scan-session-cleanup'
);
SELECT cron.schedule(
  'sms-ai-scan-session-cleanup',
  '23 3 * * *',
  'DELETE FROM public.sms_ai_scan_sessions WHERE updated_at < now() - interval ''35 days'''
);
