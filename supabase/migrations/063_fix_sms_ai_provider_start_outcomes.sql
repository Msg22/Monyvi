-- Preserve provider-start race metadata so Edge can return truthful partial results.

DROP FUNCTION IF EXISTS public.sms_ai_mark_provider_started_v2(uuid);

CREATE FUNCTION public.sms_ai_mark_provider_started_v2(
  p_request_id uuid
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
    RAISE EXCEPTION 'sms_ai_mark_provider_started_v2 is service-role only';
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
      AND outcome.sms_fingerprint = ANY(v_work.candidate_fingerprints);

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
        reservation_expires_at = NULL, updated_at = v_now
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

REVOKE ALL ON FUNCTION public.sms_ai_mark_provider_started_v2(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_mark_provider_started_v2(uuid)
TO service_role;
