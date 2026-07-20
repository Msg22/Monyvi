-- Remove the temporary preview compatibility column after replacing its last
-- writer with the privacy-safe request-digest implementation.

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

REVOKE ALL ON FUNCTION public.sms_ai_reserve_work_v2(
  uuid, text, text, text, text, integer, integer, integer, text, text[],
  integer, integer, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_reserve_work_v2(
  uuid, text, text, text, text, integer, integer, integer, text, text[],
  integer, integer, integer, integer, integer, integer, integer
) TO service_role;

DROP TRIGGER IF EXISTS scrub_sms_ai_work_request_fingerprints
  ON public.sms_ai_work_requests;
DROP FUNCTION IF EXISTS public.scrub_sms_ai_work_request_fingerprints();
ALTER TABLE public.sms_ai_work_requests
  DROP COLUMN IF EXISTS candidate_fingerprints;
