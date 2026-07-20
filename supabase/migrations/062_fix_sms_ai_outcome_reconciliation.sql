-- The outcome RPC returns columns named like the persisted row. PostgreSQL's
-- PL/pgSQL resolver must prefer table columns inside INSERT/UPSERT statements.

CREATE OR REPLACE FUNCTION public.sms_ai_reconcile_outcomes(
  p_user_id uuid,
  p_positive_fingerprints text[],
  p_negative_outcomes jsonb,
  p_strike_threshold integer DEFAULT 3
)
RETURNS TABLE (sms_fingerprint text, strike_count integer, is_terminal boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_now timestamptz := clock_timestamp();
  v_outcome jsonb;
  v_fingerprint text;
  v_received_at timestamptz;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_reconcile_outcomes is service-role only';
  END IF;
  IF p_user_id IS NULL OR p_strike_threshold <> 3 THEN
    RAISE EXCEPTION 'Invalid SMS AI outcome input';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':sms_full_parse', 0)
  );

  UPDATE public.sms_ai_negative_outcomes AS outcome
  SET deleted = true, updated_at = v_now
  WHERE outcome.user_id = p_user_id
    AND outcome.deleted = false
    AND outcome.is_terminal = false
    AND outcome.sms_fingerprint = ANY(COALESCE(p_positive_fingerprints, ARRAY[]::text[]));

  FOR v_outcome IN SELECT value FROM jsonb_array_elements(COALESCE(p_negative_outcomes, '[]'::jsonb))
  LOOP
    v_fingerprint := btrim(v_outcome->>'smsFingerprint');
    v_received_at := (v_outcome->>'originalReceivedAt')::timestamptz;
    IF length(COALESCE(v_fingerprint, '')) = 0 OR v_received_at IS NULL THEN
      RAISE EXCEPTION 'Invalid negative outcome';
    END IF;

    INSERT INTO public.sms_ai_negative_outcomes (
      user_id, sms_fingerprint, original_received_at, strike_count,
      is_terminal, terminal_at, last_classified_at, created_at, updated_at, deleted
    ) VALUES (
      p_user_id, v_fingerprint, v_received_at, 1,
      false, NULL, v_now, v_now, v_now, false
    )
    ON CONFLICT (user_id, sms_fingerprint) WHERE deleted = false
    DO UPDATE SET
      strike_count = LEAST(public.sms_ai_negative_outcomes.strike_count + 1, 3),
      is_terminal = LEAST(public.sms_ai_negative_outcomes.strike_count + 1, 3) = 3,
      terminal_at = CASE
        WHEN LEAST(public.sms_ai_negative_outcomes.strike_count + 1, 3) = 3
          THEN COALESCE(public.sms_ai_negative_outcomes.terminal_at, v_now)
        ELSE NULL
      END,
      last_classified_at = v_now,
      updated_at = v_now
    RETURNING public.sms_ai_negative_outcomes.sms_fingerprint,
      public.sms_ai_negative_outcomes.strike_count,
      public.sms_ai_negative_outcomes.is_terminal
    INTO sms_fingerprint, strike_count, is_terminal;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.sms_ai_reconcile_outcomes(
  uuid, text[], jsonb, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_reconcile_outcomes(
  uuid, text[], jsonb, integer
) TO service_role;

-- Bind retries to the exact admitted payload without persisting per-message
-- fingerprints in the allowance ledger.
ALTER TABLE public.sms_ai_work_requests
  ADD COLUMN IF NOT EXISTS request_digest text,
  ADD COLUMN IF NOT EXISTS history_cooldown_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.sms_ai_work_requests
  DROP CONSTRAINT IF EXISTS sms_ai_work_requests_request_digest_shape,
  ADD CONSTRAINT sms_ai_work_requests_request_digest_shape
    CHECK (request_digest IS NULL OR request_digest ~ '^[0-9a-f]{64}$'),
  DROP CONSTRAINT IF EXISTS sms_ai_work_requests_history_cooldown_nonnegative,
  ADD CONSTRAINT sms_ai_work_requests_history_cooldown_nonnegative
    CHECK (history_cooldown_seconds >= 0);

CREATE INDEX IF NOT EXISTS sms_ai_negative_outcomes_cleanup
  ON public.sms_ai_negative_outcomes (original_received_at)
  WHERE deleted = false AND is_terminal = false;
CREATE INDEX IF NOT EXISTS sms_ai_work_requests_cleanup
  ON public.sms_ai_work_requests (updated_at);
CREATE INDEX IF NOT EXISTS sms_ai_usage_events_cleanup
  ON public.sms_ai_usage_events (started_at);

CREATE OR REPLACE FUNCTION public.set_sms_ai_negative_outcome_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS update_sms_ai_negative_outcomes_updated_at
  ON public.sms_ai_negative_outcomes;
CREATE TRIGGER update_sms_ai_negative_outcomes_updated_at
  BEFORE UPDATE ON public.sms_ai_negative_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.set_sms_ai_negative_outcome_updated_at();

CREATE OR REPLACE FUNCTION public.sms_ai_reserve_work_v2(
  p_user_id uuid,
  p_request_key text,
  p_capability text,
  p_scan_session_id text,
  p_scan_kind text,
  p_unit_count integer,
  p_payload_bytes integer,
  p_estimated_input_tokens integer,
  p_request_digest text,
  p_candidate_fingerprints text[],
  p_max_units_per_scan integer,
  p_max_units_per_rolling_window integer,
  p_rolling_window_seconds integer,
  p_max_provider_starts_per_burst integer,
  p_burst_window_seconds integer,
  p_history_cooldown_seconds integer,
  p_reservation_lease_seconds integer
)
RETURNS TABLE (
  request_id uuid,
  accepted boolean,
  decision_code text,
  available_at timestamptz,
  is_replay boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing public.sms_ai_work_requests%ROWTYPE;
  v_decision record;
  v_now timestamptz := clock_timestamp();
  v_history_start timestamptz;
  v_history_available_at timestamptz;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_reserve_work_v2 is service-role only';
  END IF;
  IF p_request_digest !~ '^[0-9a-f]{64}$'
    OR p_candidate_fingerprints IS NULL
    OR cardinality(p_candidate_fingerprints) > 50
    OR EXISTS (
      SELECT 1 FROM unnest(p_candidate_fingerprints) AS fingerprint
      WHERE fingerprint !~ '^[0-9a-f]{64}$'
    )
    OR (p_capability = 'sms_full_parse'
      AND cardinality(p_candidate_fingerprints) <> p_unit_count)
    OR (p_capability = 'sms_category_enrichment'
      AND cardinality(p_candidate_fingerprints) <> 0)
  THEN
    RAISE EXCEPTION 'Invalid SMS AI request identity input';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_capability, 0)
  );

  SELECT * INTO v_existing
  FROM public.sms_ai_work_requests
  WHERE user_id = p_user_id
    AND capability = p_capability
    AND request_key = p_request_key
  FOR UPDATE;

  IF FOUND AND v_existing.request_digest IS DISTINCT FROM p_request_digest THEN
    RETURN QUERY SELECT v_existing.id, false, 'idempotency_conflict'::text,
      NULL::timestamptz, true;
    RETURN;
  END IF;

  IF p_capability = 'sms_full_parse'
    AND p_scan_kind = 'history'
    AND p_history_cooldown_seconds > 0
  THEN
    SELECT min(event.started_at) INTO v_history_start
    FROM public.sms_ai_usage_events AS event
    JOIN public.sms_ai_work_requests AS work ON work.id = event.request_id
    WHERE event.user_id = p_user_id
      AND event.capability = p_capability
      AND work.scan_kind = 'history'
      AND work.scan_session_id IS DISTINCT FROM p_scan_session_id
      AND event.started_at > v_now
        - make_interval(secs => p_history_cooldown_seconds);
    IF v_history_start IS NOT NULL THEN
      v_history_available_at := v_history_start
        + make_interval(secs => p_history_cooldown_seconds);
    END IF;
  END IF;

  SELECT * INTO v_decision
  FROM public.sms_ai_reserve_work(
    p_user_id,
    p_request_key,
    p_capability,
    p_scan_session_id,
    p_scan_kind,
    p_unit_count,
    p_payload_bytes,
    p_estimated_input_tokens,
    p_max_units_per_scan,
    p_max_units_per_rolling_window,
    p_rolling_window_seconds,
    p_max_provider_starts_per_burst,
    p_burst_window_seconds,
    0,
    p_reservation_lease_seconds
  );

  UPDATE public.sms_ai_work_requests
  SET request_digest = p_request_digest,
      history_cooldown_seconds = p_history_cooldown_seconds,
      updated_at = clock_timestamp()
  WHERE id = v_decision.request_id;

  IF v_history_available_at IS NOT NULL
    AND v_decision.decision_code IN ('accepted', 'rolling_limit', 'burst_limit')
    AND v_history_available_at > COALESCE(
      v_decision.available_at,
      '-infinity'::timestamptz
    )
  THEN
    UPDATE public.sms_ai_work_requests
    SET status = 'refused', decision_code = 'history_cooldown',
      available_at = v_history_available_at, reservation_expires_at = NULL,
      updated_at = v_now
    WHERE id = v_decision.request_id;
    RETURN QUERY SELECT v_decision.request_id, false,
      'history_cooldown'::text, v_history_available_at,
      v_decision.is_replay;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_decision.request_id,
    v_decision.accepted,
    v_decision.decision_code,
    v_decision.available_at,
    v_decision.is_replay;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sms_ai_mark_provider_started_v2(
  p_request_id uuid,
  p_candidate_fingerprints text[]
)
RETURNS TABLE (
  started boolean,
  decision_code text,
  terminal_fingerprints text[]
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
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_mark_provider_started_v2 is service-role only';
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
    RETURN QUERY SELECT false, 'request_not_found'::text, v_terminal_fingerprints;
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
        v_terminal_fingerprints;
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
      UPDATE public.sms_ai_work_requests
      SET status = 'refused', decision_code = 'history_cooldown',
        available_at = v_history_start
          + make_interval(secs => v_work.history_cooldown_seconds),
        reservation_expires_at = NULL, updated_at = v_now
      WHERE id = v_work.id;
      RETURN QUERY SELECT false, 'history_cooldown'::text,
        v_terminal_fingerprints;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_start
  FROM public.sms_ai_mark_provider_started(p_request_id);
  RETURN QUERY SELECT v_start.started, v_start.decision_code,
    v_terminal_fingerprints;
END;
$function$;

REVOKE ALL ON FUNCTION public.sms_ai_reserve_work_v2(
  uuid, text, text, text, text, integer, integer, integer, text, text[],
  integer, integer, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_reserve_work_v2(
  uuid, text, text, text, text, integer, integer, integer, text, text[],
  integer, integer, integer, integer, integer, integer, integer
) TO service_role;
REVOKE ALL ON FUNCTION public.sms_ai_mark_provider_started_v2(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_mark_provider_started_v2(uuid, text[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.sms_ai_cleanup_safeguards(
  p_lookback_days integer DEFAULT 30,
  p_ledger_retention_days integer DEFAULT 35
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND session_user <> 'postgres' THEN
    RAISE EXCEPTION 'sms_ai_cleanup_safeguards is service-role only';
  END IF;
  UPDATE public.sms_ai_negative_outcomes
  SET deleted = true, updated_at = v_now
  WHERE deleted = false
    AND is_terminal = false
    AND original_received_at < v_now - make_interval(days => p_lookback_days);

  DELETE FROM public.sms_ai_usage_events
  WHERE started_at < v_now - make_interval(days => p_ledger_retention_days);
  DELETE FROM public.sms_ai_work_requests
  WHERE updated_at < v_now - make_interval(days => p_ledger_retention_days);
END;
$function$;

SELECT cron.unschedule('sms-ai-safeguard-cleanup') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sms-ai-safeguard-cleanup'
);
SELECT cron.schedule(
  'sms-ai-safeguard-cleanup',
  '17 3 * * *',
  'SELECT public.sms_ai_cleanup_safeguards(30, 35)'
);
