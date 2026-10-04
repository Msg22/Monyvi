-- Issue #321: server-enforced email verification resend limiter.
--
-- Supabase Auth remains the verification authority. This migration stores only
-- privacy-safe anti-abuse state keyed by an Edge Function HMAC digest. It never
-- stores raw email addresses or verification codes.

CREATE TABLE public.email_verification_resend_limits (
  email_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  last_sent_at timestamptz,
  resend_count smallint NOT NULL DEFAULT 0,
  reservation_id uuid,
  reserved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_verification_resend_limits_key_not_blank
    CHECK (length(btrim(email_key)) >= 32),
  CONSTRAINT email_verification_resend_limits_count
    CHECK (resend_count BETWEEN 0 AND 3),
  CONSTRAINT email_verification_resend_limits_reservation_shape
    CHECK (
      (reservation_id IS NULL AND reserved_at IS NULL)
      OR (reservation_id IS NOT NULL AND reserved_at IS NOT NULL)
    )
);

ALTER TABLE public.email_verification_resend_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_verification_resend_limits
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.email_verification_resend_limits TO service_role;

CREATE OR REPLACE FUNCTION public.email_verification_register_initial_send(
  p_email_key text,
  p_email text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_sent_at timestamptz;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'email_verification_register_initial_send is service-role only';
  END IF;

  IF length(btrim(COALESCE(p_email_key, ''))) < 32
    OR length(btrim(COALESCE(p_email, ''))) = 0
  THEN
    RAISE EXCEPTION 'Invalid email verification limiter input';
  END IF;

  SELECT u.confirmation_sent_at
  INTO v_sent_at
  FROM auth.users AS u
  WHERE lower(u.email) = lower(btrim(p_email))
    AND u.email_confirmed_at IS NULL
    AND u.confirmation_sent_at IS NOT NULL
  ORDER BY u.created_at DESC
  LIMIT 1;

  IF v_sent_at IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_email_key, 0));

  INSERT INTO public.email_verification_resend_limits (
    email_key,
    window_started_at,
    last_sent_at,
    resend_count,
    created_at,
    updated_at
  )
  VALUES (
    p_email_key,
    v_sent_at,
    v_sent_at,
    0,
    clock_timestamp(),
    clock_timestamp()
  )
  ON CONFLICT (email_key) DO NOTHING;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.email_verification_reserve_resend(
  p_email_key text,
  p_email text,
  p_cooldown_seconds integer,
  p_window_seconds integer,
  p_max_resends integer,
  p_reservation_lease_seconds integer
)
RETURNS TABLE (
  reservation_id uuid,
  accepted boolean,
  decision_code text,
  available_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_initial_sent_at timestamptz;
  v_row public.email_verification_resend_limits%ROWTYPE;
  v_reservation_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'email_verification_reserve_resend is service-role only';
  END IF;

  IF length(btrim(COALESCE(p_email_key, ''))) < 32
    OR length(btrim(COALESCE(p_email, ''))) = 0
    OR p_cooldown_seconds <= 0
    OR p_window_seconds <= 0
    OR p_max_resends <= 0
    OR p_max_resends > 3
    OR p_reservation_lease_seconds <= 0
  THEN
    RAISE EXCEPTION 'Invalid email verification resend input';
  END IF;

  SELECT u.confirmation_sent_at
  INTO v_initial_sent_at
  FROM auth.users AS u
  WHERE lower(u.email) = lower(btrim(p_email))
    AND u.email_confirmed_at IS NULL
    AND u.confirmation_sent_at IS NOT NULL
  ORDER BY u.created_at DESC
  LIMIT 1;

  IF v_initial_sent_at IS NULL THEN
    RETURN QUERY SELECT
      NULL::uuid,
      false,
      'not_pending'::text,
      NULL::timestamptz;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_email_key, 0));

  INSERT INTO public.email_verification_resend_limits (
    email_key,
    window_started_at,
    last_sent_at,
    resend_count,
    created_at,
    updated_at
  )
  VALUES (
    p_email_key,
    v_initial_sent_at,
    v_initial_sent_at,
    0,
    v_now,
    v_now
  )
  ON CONFLICT (email_key) DO NOTHING;

  SELECT *
  INTO v_row
  FROM public.email_verification_resend_limits
  WHERE email_key = p_email_key
  FOR UPDATE;

  IF v_row.window_started_at
      + make_interval(secs => p_window_seconds) <= v_now
  THEN
    UPDATE public.email_verification_resend_limits
    SET window_started_at = v_now,
        last_sent_at = NULL,
        resend_count = 0,
        reservation_id = NULL,
        reserved_at = NULL,
        updated_at = v_now
    WHERE email_key = p_email_key
    RETURNING * INTO v_row;
  ELSIF v_row.reservation_id IS NOT NULL
    AND v_row.reserved_at
        + make_interval(secs => p_reservation_lease_seconds) <= v_now
  THEN
    UPDATE public.email_verification_resend_limits
    SET reservation_id = NULL,
        reserved_at = NULL,
        updated_at = v_now
    WHERE email_key = p_email_key
    RETURNING * INTO v_row;
  END IF;

  IF v_row.reservation_id IS NOT NULL THEN
    RETURN QUERY SELECT
      NULL::uuid,
      false,
      'busy'::text,
      v_row.reserved_at
        + make_interval(secs => p_reservation_lease_seconds);
    RETURN;
  END IF;

  IF v_row.last_sent_at IS NOT NULL
    AND v_row.last_sent_at + make_interval(secs => p_cooldown_seconds) > v_now
  THEN
    RETURN QUERY SELECT
      NULL::uuid,
      false,
      'cooldown'::text,
      v_row.last_sent_at + make_interval(secs => p_cooldown_seconds);
    RETURN;
  END IF;

  IF v_row.resend_count >= p_max_resends THEN
    RETURN QUERY SELECT
      NULL::uuid,
      false,
      'limit'::text,
      v_row.window_started_at + make_interval(secs => p_window_seconds);
    RETURN;
  END IF;

  v_reservation_id := gen_random_uuid();

  UPDATE public.email_verification_resend_limits
  SET reservation_id = v_reservation_id,
      reserved_at = v_now,
      updated_at = v_now
  WHERE email_key = p_email_key;

  RETURN QUERY SELECT
    v_reservation_id,
    true,
    'accepted'::text,
    NULL::timestamptz;
END;
$function$;

CREATE OR REPLACE FUNCTION public.email_verification_finalize_resend(
  p_email_key text,
  p_reservation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_updated integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'email_verification_finalize_resend is service-role only';
  END IF;

  IF length(btrim(COALESCE(p_email_key, ''))) < 32
    OR p_reservation_id IS NULL
  THEN
    RAISE EXCEPTION 'Invalid email verification finalize input';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_email_key, 0));

  UPDATE public.email_verification_resend_limits
  SET resend_count = resend_count + 1,
      last_sent_at = clock_timestamp(),
      reservation_id = NULL,
      reserved_at = NULL,
      updated_at = clock_timestamp()
  WHERE email_key = p_email_key
    AND reservation_id = p_reservation_id
    AND resend_count < 3;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.email_verification_release_resend(
  p_email_key text,
  p_reservation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_updated integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'email_verification_release_resend is service-role only';
  END IF;

  IF length(btrim(COALESCE(p_email_key, ''))) < 32
    OR p_reservation_id IS NULL
  THEN
    RAISE EXCEPTION 'Invalid email verification release input';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_email_key, 0));

  UPDATE public.email_verification_resend_limits
  SET reservation_id = NULL,
      reserved_at = NULL,
      updated_at = clock_timestamp()
  WHERE email_key = p_email_key
    AND reservation_id = p_reservation_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.email_verification_register_initial_send(text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_verification_reserve_resend(
  text,text,integer,integer,integer,integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_verification_finalize_resend(text,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_verification_release_resend(text,uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.email_verification_register_initial_send(text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.email_verification_reserve_resend(
  text,text,integer,integer,integer,integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_verification_finalize_resend(text,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.email_verification_release_resend(text,uuid)
  TO service_role;
