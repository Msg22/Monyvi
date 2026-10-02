-- MIG-078: restore the missing public.sms_ai_get_availability RPC in staging.
--
-- Staging applied 061 without these statements, so hosted
-- GET /sms-ai-availability fails (503). This additive migration restores
-- exactly the authoritative definition from immutable
-- 061_sms_ai_safeguards.sql (function lines 542-713 plus the
-- revoke/grant lines 918-923). No other DDL or data changes.

CREATE OR REPLACE FUNCTION public.sms_ai_get_availability(
  p_user_id uuid,
  p_max_units_per_rolling_window integer,
  p_rolling_window_seconds integer,
  p_max_provider_starts_per_burst integer,
  p_burst_window_seconds integer,
  p_history_cooldown_seconds integer
)
RETURNS TABLE (
  server_now timestamptz,
  rolling_available_at timestamptz,
  burst_available_at timestamptz,
  history_cooldown_available_at timestamptz,
  available_at timestamptz,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_rolling_units integer := 0;
  v_burst_starts integer := 0;
  v_rolling_available_at timestamptz;
  v_burst_available_at timestamptz;
  v_history_cooldown_available_at timestamptz;
  v_first_history_start timestamptz;
  v_available_at timestamptz;
  v_reason text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_get_availability is service-role only';
  END IF;

  IF p_user_id IS NULL
    OR p_max_units_per_rolling_window <= 0
    OR p_rolling_window_seconds <= 0
    OR p_max_provider_starts_per_burst <= 0
    OR p_burst_window_seconds <= 0
    OR p_history_cooldown_seconds <= 0
  THEN
    RAISE EXCEPTION 'Invalid SMS AI availability input';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':sms_full_parse', 0));

  SELECT (
    COALESCE((
      SELECT sum(unit_count)
      FROM public.sms_ai_usage_events
      WHERE user_id = p_user_id
        AND capability = 'sms_full_parse'
        AND started_at > v_now - make_interval(secs => p_rolling_window_seconds)
    ), 0)
    + COALESCE((
      SELECT sum(unit_count)
      FROM public.sms_ai_work_requests
      WHERE user_id = p_user_id
        AND capability = 'sms_full_parse'
        AND status = 'reserved'
        AND reservation_expires_at > v_now
    ), 0)
  )::integer INTO v_rolling_units;

  IF v_rolling_units + 1 > p_max_units_per_rolling_window THEN
    SELECT min(expiry) INTO v_rolling_available_at
    FROM (
      SELECT expiry,
        sum(expiring_units) OVER (ORDER BY expiry, source_key) AS expired_units
      FROM (
        SELECT started_at + make_interval(secs => p_rolling_window_seconds) AS expiry,
          unit_count AS expiring_units, id::text AS source_key
        FROM public.sms_ai_usage_events
        WHERE user_id = p_user_id
          AND capability = 'sms_full_parse'
          AND started_at > v_now - make_interval(secs => p_rolling_window_seconds)
        UNION ALL
        SELECT reservation_expires_at, unit_count, id::text
        FROM public.sms_ai_work_requests
        WHERE user_id = p_user_id
          AND capability = 'sms_full_parse'
          AND status = 'reserved'
          AND reservation_expires_at > v_now
      ) AS capacity_sources
    ) AS cumulative_expiry
    WHERE v_rolling_units + 1 - expired_units
      <= p_max_units_per_rolling_window;
  END IF;

  SELECT (
    COALESCE((
      SELECT count(*)
      FROM public.sms_ai_usage_events
      WHERE user_id = p_user_id
        AND capability = 'sms_full_parse'
        AND started_at > v_now - make_interval(secs => p_burst_window_seconds)
    ), 0)
    + COALESCE((
      SELECT count(*)
      FROM public.sms_ai_work_requests
      WHERE user_id = p_user_id
        AND capability = 'sms_full_parse'
        AND status = 'reserved'
        AND reservation_expires_at > v_now
    ), 0)
  )::integer INTO v_burst_starts;

  IF v_burst_starts + 1 > p_max_provider_starts_per_burst THEN
    SELECT min(expiry) INTO v_burst_available_at
    FROM (
      SELECT started_at + make_interval(secs => p_burst_window_seconds) AS expiry
      FROM public.sms_ai_usage_events
      WHERE user_id = p_user_id
        AND capability = 'sms_full_parse'
        AND started_at > v_now - make_interval(secs => p_burst_window_seconds)
      UNION ALL
      SELECT reservation_expires_at
      FROM public.sms_ai_work_requests
      WHERE user_id = p_user_id
        AND capability = 'sms_full_parse'
        AND status = 'reserved'
        AND reservation_expires_at > v_now
    ) AS burst_expiries;
  END IF;

  SELECT min(history_scan.first_started_at) INTO v_first_history_start
  FROM (
    SELECT min(event.started_at) AS first_started_at
    FROM public.sms_ai_usage_events AS event
    JOIN public.sms_ai_work_requests AS work ON work.id = event.request_id
    WHERE event.user_id = p_user_id
      AND event.capability = 'sms_full_parse'
      AND work.scan_kind = 'history'
    GROUP BY COALESCE(work.scan_session_id, work.id::text)
  ) AS history_scan
  WHERE history_scan.first_started_at > v_now
    - make_interval(secs => p_history_cooldown_seconds);

  IF v_first_history_start IS NOT NULL THEN
    v_history_cooldown_available_at := v_first_history_start
      + make_interval(secs => p_history_cooldown_seconds);
  END IF;

  v_available_at := NULLIF(
    GREATEST(
      COALESCE(v_rolling_available_at, '-infinity'::timestamptz),
      COALESCE(v_burst_available_at, '-infinity'::timestamptz),
      COALESCE(v_history_cooldown_available_at, '-infinity'::timestamptz)
    ),
    '-infinity'::timestamptz
  );

  IF v_available_at IS NULL THEN
    v_reason := NULL;
  ELSIF v_history_cooldown_available_at = v_available_at THEN
    v_reason := 'history_cooldown';
  ELSIF v_burst_available_at = v_available_at THEN
    v_reason := 'burst_limit';
  ELSE
    v_reason := 'rolling_limit';
  END IF;

  RETURN QUERY SELECT
    v_now,
    v_rolling_available_at,
    v_burst_available_at,
    v_history_cooldown_available_at,
    v_available_at,
    v_reason;
END;
$function$;

REVOKE ALL ON FUNCTION public.sms_ai_get_availability(
  uuid, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_get_availability(
  uuid, integer, integer, integer, integer, integer
) TO service_role;
