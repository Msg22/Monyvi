-- Launch SMS scan safeguards: privacy-safe negative outcomes plus server-only
-- admission and usage ledgers. Financial payloads never enter these tables.

CREATE TABLE public.sms_ai_negative_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sms_fingerprint text NOT NULL,
  original_received_at timestamptz NOT NULL,
  strike_count integer NOT NULL DEFAULT 1,
  is_terminal boolean NOT NULL DEFAULT false,
  terminal_at timestamptz,
  last_classified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT sms_ai_negative_outcomes_fingerprint_not_blank
    CHECK (length(btrim(sms_fingerprint)) > 0),
  CONSTRAINT sms_ai_negative_outcomes_strike_range
    CHECK (strike_count BETWEEN 1 AND 3),
  CONSTRAINT sms_ai_negative_outcomes_terminal_matches_strikes
    CHECK (is_terminal = (strike_count = 3)),
  CONSTRAINT sms_ai_negative_outcomes_terminal_timestamp
    CHECK ((is_terminal AND terminal_at IS NOT NULL) OR (NOT is_terminal AND terminal_at IS NULL))
);

CREATE UNIQUE INDEX sms_ai_negative_outcomes_active_fingerprint
  ON public.sms_ai_negative_outcomes (user_id, sms_fingerprint)
  WHERE deleted = false;
CREATE INDEX sms_ai_negative_outcomes_user_updated
  ON public.sms_ai_negative_outcomes (user_id, updated_at);
CREATE INDEX sms_ai_negative_outcomes_terminal_lookup
  ON public.sms_ai_negative_outcomes (user_id, sms_fingerprint)
  WHERE deleted = false AND is_terminal = true;

ALTER TABLE public.sms_ai_negative_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can pull their SMS AI negative outcomes"
  ON public.sms_ai_negative_outcomes
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.sms_ai_negative_outcomes FROM anon, authenticated;

CREATE TABLE public.sms_ai_work_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key text NOT NULL,
  capability text NOT NULL,
  scan_session_id text,
  scan_kind text,
  unit_count integer NOT NULL,
  payload_bytes integer NOT NULL,
  estimated_input_tokens integer NOT NULL,
  status text NOT NULL,
  decision_code text NOT NULL,
  available_at timestamptz,
  reservation_expires_at timestamptz,
  provider_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_ai_work_requests_identity UNIQUE (user_id, capability, request_key),
  CONSTRAINT sms_ai_work_requests_request_key_not_blank
    CHECK (length(btrim(request_key)) BETWEEN 1 AND 160),
  CONSTRAINT sms_ai_work_requests_capability
    CHECK (capability IN ('sms_full_parse', 'sms_category_enrichment')),
  CONSTRAINT sms_ai_work_requests_scan_kind
    CHECK (scan_kind IS NULL OR scan_kind IN ('initial', 'incremental', 'history', 'live')),
  CONSTRAINT sms_ai_work_requests_positive_units CHECK (unit_count > 0),
  CONSTRAINT sms_ai_work_requests_nonnegative_sizes
    CHECK (payload_bytes >= 0 AND estimated_input_tokens >= 0),
  CONSTRAINT sms_ai_work_requests_status
    CHECK (status IN (
      'reserved',
      'provider_started',
      'completed',
      'completed_with_provider_error',
      'released',
      'refused'
    )),
  CONSTRAINT sms_ai_work_requests_reservation_shape CHECK (
    (status = 'reserved' AND reservation_expires_at IS NOT NULL AND provider_started_at IS NULL)
    OR status <> 'reserved'
  )
);

CREATE INDEX sms_ai_work_requests_active_capacity
  ON public.sms_ai_work_requests (user_id, capability, status, reservation_expires_at);
CREATE INDEX sms_ai_work_requests_session_capacity
  ON public.sms_ai_work_requests (user_id, capability, scan_session_id, status);

ALTER TABLE public.sms_ai_work_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_ai_work_requests FROM anon, authenticated;

CREATE TABLE public.sms_ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.sms_ai_work_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability text NOT NULL,
  unit_count integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_ai_usage_events_request_once UNIQUE (request_id),
  CONSTRAINT sms_ai_usage_events_capability
    CHECK (capability IN ('sms_full_parse', 'sms_category_enrichment')),
  CONSTRAINT sms_ai_usage_events_positive_units CHECK (unit_count > 0)
);

CREATE INDEX sms_ai_usage_events_rolling_allowance
  ON public.sms_ai_usage_events (user_id, capability, started_at);

ALTER TABLE public.sms_ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_ai_usage_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.sms_ai_reserve_work(
  p_user_id uuid,
  p_request_key text,
  p_capability text,
  p_scan_session_id text,
  p_scan_kind text,
  p_unit_count integer,
  p_payload_bytes integer,
  p_estimated_input_tokens integer,
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
  v_now timestamptz := clock_timestamp();
  v_existing public.sms_ai_work_requests%ROWTYPE;
  v_request_id uuid;
  v_scan_units integer := 0;
  v_rolling_units integer := 0;
  v_burst_starts integer := 0;
  v_available_at timestamptz;
  v_rolling_available_at timestamptz;
  v_burst_available_at timestamptz;
  v_history_available_at timestamptz;
  v_first_history_start timestamptz;
  v_reclaimed_request_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_reserve_work is service-role only';
  END IF;

  IF p_user_id IS NULL
    OR length(btrim(COALESCE(p_request_key, ''))) NOT BETWEEN 1 AND 160
    OR p_capability NOT IN ('sms_full_parse', 'sms_category_enrichment')
    OR p_unit_count <= 0
    OR p_payload_bytes < 0
    OR p_estimated_input_tokens < 0
    OR p_max_units_per_rolling_window <= 0
    OR p_rolling_window_seconds <= 0
    OR p_max_provider_starts_per_burst <= 0
    OR p_burst_window_seconds <= 0
    OR p_reservation_lease_seconds <= 0
  THEN
    RAISE EXCEPTION 'Invalid SMS AI reservation input';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_capability, 0));

  SELECT * INTO v_existing
  FROM public.sms_ai_work_requests
  WHERE user_id = p_user_id
    AND capability = p_capability
    AND request_key = p_request_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'reserved'
      AND v_existing.reservation_expires_at <= v_now
    THEN
      UPDATE public.sms_ai_work_requests
      SET status = 'released',
          decision_code = 'reservation_expired',
          reservation_expires_at = NULL,
          updated_at = v_now
      WHERE id = v_existing.id;
      v_reclaimed_request_id := v_existing.id;
    ELSIF v_existing.status = 'reserved' THEN
      RETURN QUERY SELECT v_existing.id, true, v_existing.decision_code,
        v_existing.available_at, true;
      RETURN;
    ELSIF v_existing.status IN (
      'provider_started', 'completed', 'completed_with_provider_error'
    ) THEN
      RETURN QUERY SELECT v_existing.id, false,
        'already_processed_result_unavailable'::text, NULL::timestamptz, true;
      RETURN;
    ELSE
      RETURN QUERY SELECT v_existing.id, false, v_existing.decision_code,
        v_existing.available_at, true;
      RETURN;
    END IF;
  END IF;

  UPDATE public.sms_ai_work_requests
  SET status = 'released',
      decision_code = 'reservation_expired',
      reservation_expires_at = NULL,
      updated_at = v_now
  WHERE user_id = p_user_id
    AND capability = p_capability
    AND status = 'reserved'
    AND reservation_expires_at <= v_now;

  IF p_capability = 'sms_full_parse'
    AND p_scan_session_id IS NOT NULL
    AND p_max_units_per_scan > 0
  THEN
    SELECT COALESCE(sum(unit_count), 0)::integer INTO v_scan_units
    FROM public.sms_ai_work_requests
    WHERE user_id = p_user_id
      AND capability = p_capability
      AND scan_session_id = p_scan_session_id
      AND status IN (
        'reserved', 'provider_started', 'completed', 'completed_with_provider_error'
      );

    IF v_scan_units + p_unit_count > p_max_units_per_scan THEN
      IF v_reclaimed_request_id IS NOT NULL THEN
        UPDATE public.sms_ai_work_requests
        SET status = 'refused', decision_code = 'scan_limit',
          available_at = NULL, reservation_expires_at = NULL, updated_at = v_now
        WHERE id = v_reclaimed_request_id
        RETURNING id INTO v_request_id;
      ELSE
        INSERT INTO public.sms_ai_work_requests (
          user_id, request_key, capability, scan_session_id, scan_kind,
          unit_count, payload_bytes, estimated_input_tokens, status, decision_code
        ) VALUES (
          p_user_id, p_request_key, p_capability, p_scan_session_id, p_scan_kind,
          p_unit_count, p_payload_bytes, p_estimated_input_tokens, 'refused', 'scan_limit'
        ) RETURNING id INTO v_request_id;
      END IF;
      RETURN QUERY SELECT v_request_id, false, 'scan_limit'::text, NULL::timestamptz, false;
      RETURN;
    END IF;
  END IF;

  SELECT (
    COALESCE((
      SELECT sum(unit_count)
      FROM public.sms_ai_usage_events
      WHERE user_id = p_user_id
        AND capability = p_capability
        AND started_at > v_now - make_interval(secs => p_rolling_window_seconds)
    ), 0)
    + COALESCE((
      SELECT sum(unit_count)
      FROM public.sms_ai_work_requests
      WHERE user_id = p_user_id
        AND capability = p_capability
        AND status = 'reserved'
        AND reservation_expires_at > v_now
    ), 0)
  )::integer INTO v_rolling_units;

  IF v_rolling_units + p_unit_count > p_max_units_per_rolling_window THEN
    SELECT min(expiry) INTO v_rolling_available_at
    FROM (
      SELECT expiry, sum(expiring_units) OVER (ORDER BY expiry, source_key) AS expired_units
      FROM (
        SELECT started_at + make_interval(secs => p_rolling_window_seconds) AS expiry,
          unit_count AS expiring_units, id::text AS source_key
        FROM public.sms_ai_usage_events
        WHERE user_id = p_user_id
          AND capability = p_capability
          AND started_at > v_now - make_interval(secs => p_rolling_window_seconds)
        UNION ALL
        SELECT reservation_expires_at, unit_count, id::text
        FROM public.sms_ai_work_requests
        WHERE user_id = p_user_id
          AND capability = p_capability
          AND status = 'reserved'
          AND reservation_expires_at > v_now
      ) AS capacity_sources
    ) AS cumulative_expiry
    WHERE v_rolling_units + p_unit_count - expired_units
      <= p_max_units_per_rolling_window;

    SELECT (
      COALESCE((
        SELECT count(*)
        FROM public.sms_ai_usage_events
        WHERE user_id = p_user_id
          AND capability = p_capability
          AND started_at > v_now - make_interval(secs => p_burst_window_seconds)
      ), 0)
      + COALESCE((
        SELECT count(*)
        FROM public.sms_ai_work_requests
        WHERE user_id = p_user_id
          AND capability = p_capability
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
          AND capability = p_capability
          AND started_at > v_now - make_interval(secs => p_burst_window_seconds)
        UNION ALL
        SELECT reservation_expires_at
        FROM public.sms_ai_work_requests
        WHERE user_id = p_user_id
          AND capability = p_capability
          AND status = 'reserved'
          AND reservation_expires_at > v_now
      ) AS burst_expiries;
    END IF;

    IF p_capability = 'sms_full_parse' AND p_scan_kind = 'history'
      AND p_history_cooldown_seconds > 0
    THEN
      SELECT min(history_scan.first_started_at) INTO v_first_history_start
      FROM (
        SELECT min(event.started_at) AS first_started_at
        FROM public.sms_ai_usage_events AS event
        JOIN public.sms_ai_work_requests AS work ON work.id = event.request_id
        WHERE event.user_id = p_user_id
          AND event.capability = p_capability
          AND work.scan_kind = 'history'
          AND work.scan_session_id IS DISTINCT FROM p_scan_session_id
        GROUP BY COALESCE(work.scan_session_id, work.id::text)
      ) AS history_scan
      WHERE history_scan.first_started_at > v_now
        - make_interval(secs => p_history_cooldown_seconds);

      IF v_first_history_start IS NOT NULL THEN
        v_history_available_at := v_first_history_start
          + make_interval(secs => p_history_cooldown_seconds);
      END IF;
    END IF;

    v_available_at := GREATEST(
      v_rolling_available_at,
      COALESCE(v_burst_available_at, '-infinity'::timestamptz),
      COALESCE(v_history_available_at, '-infinity'::timestamptz)
    );

    IF v_reclaimed_request_id IS NOT NULL THEN
      UPDATE public.sms_ai_work_requests
      SET status = 'refused', decision_code = 'rolling_limit',
        available_at = v_available_at, reservation_expires_at = NULL,
        updated_at = v_now
      WHERE id = v_reclaimed_request_id
      RETURNING id INTO v_request_id;
    ELSE
      INSERT INTO public.sms_ai_work_requests (
      user_id, request_key, capability, scan_session_id, scan_kind,
      unit_count, payload_bytes, estimated_input_tokens, status, decision_code,
      available_at
    ) VALUES (
      p_user_id, p_request_key, p_capability, p_scan_session_id, p_scan_kind,
      p_unit_count, p_payload_bytes, p_estimated_input_tokens, 'refused',
      'rolling_limit', v_available_at
      ) RETURNING id INTO v_request_id;
    END IF;
    RETURN QUERY SELECT v_request_id, false, 'rolling_limit'::text,
      v_available_at, false;
    RETURN;
  END IF;

  SELECT (
    COALESCE((
      SELECT count(*)
      FROM public.sms_ai_usage_events
      WHERE user_id = p_user_id
        AND capability = p_capability
        AND started_at > v_now - make_interval(secs => p_burst_window_seconds)
    ), 0)
    + COALESCE((
      SELECT count(*)
      FROM public.sms_ai_work_requests
      WHERE user_id = p_user_id
        AND capability = p_capability
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
        AND capability = p_capability
        AND started_at > v_now - make_interval(secs => p_burst_window_seconds)
      UNION ALL
      SELECT reservation_expires_at
      FROM public.sms_ai_work_requests
      WHERE user_id = p_user_id
        AND capability = p_capability
        AND status = 'reserved'
        AND reservation_expires_at > v_now
    ) AS burst_expiries;

    IF p_capability = 'sms_full_parse' AND p_scan_kind = 'history'
      AND p_history_cooldown_seconds > 0
    THEN
      SELECT min(history_scan.first_started_at) INTO v_first_history_start
      FROM (
        SELECT min(event.started_at) AS first_started_at
        FROM public.sms_ai_usage_events AS event
        JOIN public.sms_ai_work_requests AS work ON work.id = event.request_id
        WHERE event.user_id = p_user_id
          AND event.capability = p_capability
          AND work.scan_kind = 'history'
          AND work.scan_session_id IS DISTINCT FROM p_scan_session_id
        GROUP BY COALESCE(work.scan_session_id, work.id::text)
      ) AS history_scan
      WHERE history_scan.first_started_at > v_now
        - make_interval(secs => p_history_cooldown_seconds);

      IF v_first_history_start IS NOT NULL THEN
        v_history_available_at := v_first_history_start
          + make_interval(secs => p_history_cooldown_seconds);
      END IF;
    END IF;

    v_available_at := GREATEST(
      v_burst_available_at,
      COALESCE(v_history_available_at, '-infinity'::timestamptz)
    );

    IF v_reclaimed_request_id IS NOT NULL THEN
      UPDATE public.sms_ai_work_requests
      SET status = 'refused', decision_code = 'burst_limit',
        available_at = v_available_at, reservation_expires_at = NULL,
        updated_at = v_now
      WHERE id = v_reclaimed_request_id
      RETURNING id INTO v_request_id;
    ELSE
      INSERT INTO public.sms_ai_work_requests (
      user_id, request_key, capability, scan_session_id, scan_kind,
      unit_count, payload_bytes, estimated_input_tokens, status, decision_code,
      available_at
    ) VALUES (
      p_user_id, p_request_key, p_capability, p_scan_session_id, p_scan_kind,
      p_unit_count, p_payload_bytes, p_estimated_input_tokens, 'refused',
      'burst_limit', v_available_at
      ) RETURNING id INTO v_request_id;
    END IF;
    RETURN QUERY SELECT v_request_id, false, 'burst_limit'::text,
      v_available_at, false;
    RETURN;
  END IF;

  IF p_capability = 'sms_full_parse'
    AND p_scan_kind = 'history'
    AND p_history_cooldown_seconds > 0
  THEN
    SELECT min(history_scan.first_started_at) INTO v_first_history_start
    FROM (
      SELECT min(event.started_at) AS first_started_at
      FROM public.sms_ai_usage_events AS event
      JOIN public.sms_ai_work_requests AS work ON work.id = event.request_id
      WHERE event.user_id = p_user_id
        AND event.capability = p_capability
        AND work.scan_kind = 'history'
        AND work.scan_session_id IS DISTINCT FROM p_scan_session_id
      GROUP BY COALESCE(work.scan_session_id, work.id::text)
    ) AS history_scan
    WHERE history_scan.first_started_at > v_now
      - make_interval(secs => p_history_cooldown_seconds);

    IF v_first_history_start IS NOT NULL THEN
      v_history_available_at := v_first_history_start
        + make_interval(secs => p_history_cooldown_seconds);
      IF v_reclaimed_request_id IS NOT NULL THEN
        UPDATE public.sms_ai_work_requests
        SET status = 'refused', decision_code = 'history_cooldown',
          available_at = v_history_available_at, reservation_expires_at = NULL,
          updated_at = v_now
        WHERE id = v_reclaimed_request_id
        RETURNING id INTO v_request_id;
      ELSE
        INSERT INTO public.sms_ai_work_requests (
        user_id, request_key, capability, scan_session_id, scan_kind,
        unit_count, payload_bytes, estimated_input_tokens, status, decision_code,
        available_at
      ) VALUES (
        p_user_id, p_request_key, p_capability, p_scan_session_id, p_scan_kind,
        p_unit_count, p_payload_bytes, p_estimated_input_tokens, 'refused',
        'history_cooldown', v_history_available_at
        ) RETURNING id INTO v_request_id;
      END IF;
      RETURN QUERY SELECT v_request_id, false, 'history_cooldown'::text,
        v_history_available_at, false;
      RETURN;
    END IF;
  END IF;

  IF v_reclaimed_request_id IS NOT NULL THEN
    UPDATE public.sms_ai_work_requests
    SET status = 'reserved', decision_code = 'accepted', available_at = NULL,
      reservation_expires_at = v_now + make_interval(secs => p_reservation_lease_seconds),
      provider_started_at = NULL, updated_at = v_now,
      scan_session_id = p_scan_session_id, scan_kind = p_scan_kind,
      unit_count = p_unit_count, payload_bytes = p_payload_bytes,
      estimated_input_tokens = p_estimated_input_tokens
    WHERE id = v_reclaimed_request_id
    RETURNING id INTO v_request_id;
  ELSE
    INSERT INTO public.sms_ai_work_requests (
    user_id, request_key, capability, scan_session_id, scan_kind,
    unit_count, payload_bytes, estimated_input_tokens, status, decision_code,
    reservation_expires_at
  ) VALUES (
    p_user_id, p_request_key, p_capability, p_scan_session_id, p_scan_kind,
    p_unit_count, p_payload_bytes, p_estimated_input_tokens, 'reserved',
    'accepted', v_now + make_interval(secs => p_reservation_lease_seconds)
    ) RETURNING id INTO v_request_id;
  END IF;

  RETURN QUERY SELECT v_request_id, true, 'accepted'::text, NULL::timestamptz, false;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.sms_ai_mark_provider_started(p_request_id uuid)
RETURNS TABLE (started boolean, decision_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_work public.sms_ai_work_requests%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_mark_provider_started is service-role only';
  END IF;

  SELECT * INTO v_work FROM public.sms_ai_work_requests
  WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'request_not_found'::text;
    RETURN;
  END IF;
  IF v_work.status IN ('provider_started', 'completed', 'completed_with_provider_error') THEN
    RETURN QUERY SELECT false, 'already_processed_result_unavailable'::text;
    RETURN;
  END IF;
  IF v_work.status <> 'reserved' OR v_work.reservation_expires_at <= v_now THEN
    IF v_work.status = 'reserved' THEN
      UPDATE public.sms_ai_work_requests
      SET status = 'released', decision_code = 'reservation_expired',
        reservation_expires_at = NULL, updated_at = v_now
      WHERE id = p_request_id;
    END IF;
    RETURN QUERY SELECT false, 'reservation_expired'::text;
    RETURN;
  END IF;

  INSERT INTO public.sms_ai_usage_events (
    request_id, user_id, capability, unit_count, started_at
  ) VALUES (
    v_work.id, v_work.user_id, v_work.capability, v_work.unit_count, v_now
  ) ON CONFLICT (request_id) DO NOTHING;

  UPDATE public.sms_ai_work_requests
  SET status = 'provider_started', decision_code = 'provider_started',
    provider_started_at = v_now, reservation_expires_at = NULL, updated_at = v_now
  WHERE id = p_request_id;

  RETURN QUERY SELECT true, 'provider_started'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sms_ai_release_work(
  p_request_id uuid,
  p_decision_code text DEFAULT 'released_before_provider_start'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_release_work is service-role only';
  END IF;
  UPDATE public.sms_ai_work_requests
  SET status = 'released', decision_code = p_decision_code,
    reservation_expires_at = NULL, updated_at = clock_timestamp()
  WHERE id = p_request_id AND status = 'reserved';
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sms_ai_complete_work(
  p_request_id uuid,
  p_completed_with_provider_error boolean,
  p_decision_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_complete_work is service-role only';
  END IF;
  UPDATE public.sms_ai_work_requests
  SET status = CASE WHEN p_completed_with_provider_error
      THEN 'completed_with_provider_error' ELSE 'completed' END,
    decision_code = p_decision_code,
    updated_at = clock_timestamp()
  WHERE id = p_request_id AND status = 'provider_started';
  RETURN FOUND;
END;
$function$;

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

REVOKE ALL ON FUNCTION public.sms_ai_reserve_work(
  uuid, text, text, text, text, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_reserve_work(
  uuid, text, text, text, text, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.sms_ai_mark_provider_started(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_mark_provider_started(uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.sms_ai_get_availability(
  uuid, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_get_availability(
  uuid, integer, integer, integer, integer, integer
) TO service_role;
REVOKE ALL ON FUNCTION public.sms_ai_release_work(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_release_work(uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.sms_ai_complete_work(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_complete_work(uuid, boolean, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.sms_ai_reconcile_outcomes(uuid, text[], jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_reconcile_outcomes(uuid, text[], jsonb, integer)
  TO service_role;
REVOKE ALL ON FUNCTION public.sms_ai_cleanup_safeguards(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_ai_cleanup_safeguards(integer, integer)
  TO service_role;

SELECT cron.unschedule('sms-ai-safeguard-cleanup') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sms-ai-safeguard-cleanup'
);
SELECT cron.schedule(
  'sms-ai-safeguard-cleanup',
  '17 3 * * *',
  'SELECT public.sms_ai_cleanup_safeguards(30, 35)'
);
