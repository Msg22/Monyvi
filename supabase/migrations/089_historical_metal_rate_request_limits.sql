-- Issue #387: Authoritative server-side request rate limits for fetch-historical-metal-rate.
--
-- Restricts authenticated requests to a maximum of 60 requests per account per rolling hour.
-- Storage lives in private schema to isolate from mobile WatermelonDB schema/sync.
-- Evaluated against server clock_timestamp() captured AFTER acquiring the per-user advisory lock.
-- All table access is restricted to SECURITY DEFINER RPCs; REVOKED from PUBLIC, anon, authenticated, AND service_role.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.historical_metal_rate_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX historical_metal_rate_requests_user_requested_at
  ON private.historical_metal_rate_requests (user_id, requested_at DESC);

ALTER TABLE private.historical_metal_rate_requests ENABLE ROW LEVEL SECURITY;

-- Revoke all table privileges from all roles including service_role
REVOKE ALL ON private.historical_metal_rate_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.historical_metal_rate_reserve_request(
  p_user_id uuid
)
RETURNS TABLE (
  accepted boolean,
  remaining integer,
  reset_at timestamptz,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  c_max_requests CONSTANT integer := 60;
  c_window CONSTANT interval := interval '1 hour';
  v_now timestamptz;
  v_window_start timestamptz;
  v_count integer;
  v_earliest_expiry timestamptz;
  v_retry_after integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid historical metal rate reservation input' USING ERRCODE = '22023';
  END IF;

  -- Acquire per-user advisory transaction lock to serialize reservations across instances
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':historical_metal_rate_limit', 0));

  -- Capture server timestamp AFTER advisory lock acquisition
  v_now := pg_catalog.clock_timestamp();
  v_window_start := v_now - c_window;

  -- Prune expired reservations for this user older than or equal to 1 hour
  DELETE FROM private.historical_metal_rate_requests
  WHERE user_id = p_user_id
    AND requested_at <= v_window_start;

  -- Count recent requests within the rolling preceding hour
  SELECT count(*)::integer
  INTO v_count
  FROM private.historical_metal_rate_requests
  WHERE user_id = p_user_id
    AND requested_at > v_window_start;

  IF v_count >= c_max_requests THEN
    -- Find the earliest expiring request in the window to determine retry-after
    SELECT min(requested_at) + c_window
    INTO v_earliest_expiry
    FROM private.historical_metal_rate_requests
    WHERE user_id = p_user_id
      AND requested_at > v_window_start;

    IF v_earliest_expiry IS NULL OR v_earliest_expiry <= v_now THEN
      v_retry_after := 1;
      v_earliest_expiry := v_now + interval '1 second';
    ELSE
      v_retry_after := pg_catalog.ceil(pg_catalog.date_part('epoch', v_earliest_expiry - v_now))::integer;
      IF v_retry_after <= 0 THEN
        v_retry_after := 1;
      END IF;
    END IF;

    RETURN QUERY SELECT
      false,
      0,
      v_earliest_expiry,
      v_retry_after;
    RETURN;
  END IF;

  -- Insert new reservation entry
  INSERT INTO private.historical_metal_rate_requests (
    user_id,
    requested_at,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    v_now,
    v_now,
    v_now
  );

  v_count := v_count + 1;

  RETURN QUERY SELECT
    true,
    GREATEST(0, c_max_requests - v_count),
    v_now + c_window,
    0;
END;
$function$;

REVOKE ALL ON FUNCTION public.historical_metal_rate_reserve_request(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.historical_metal_rate_reserve_request(uuid)
  TO service_role;
