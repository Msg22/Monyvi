-- Ordinary sync publication fence. Market publication remains independent.
BEGIN;

CREATE TABLE private.sync_pull_barrier (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_sealed_watermark timestamptz NOT NULL CHECK (isfinite(last_sealed_watermark))
);
INSERT INTO private.sync_pull_barrier(singleton, last_sealed_watermark)
VALUES (true, '1970-01-01 00:00:00+00');
ALTER TABLE private.sync_pull_barrier ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sync_pull_barrier FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.acquire_sync_writer_fence_v1()
RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sealed timestamptz;
BEGIN
  SELECT last_sealed_watermark INTO STRICT v_sealed
  FROM private.sync_pull_barrier WHERE singleton FOR SHARE;
  RETURN v_sealed;
END;
$$;
REVOKE ALL ON FUNCTION private.acquire_sync_writer_fence_v1()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.sync_write_time_v1()
RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sealed timestamptz;
  v_now timestamptz;
BEGIN
  v_sealed := private.acquire_sync_writer_fence_v1();
  LOOP
    v_now := clock_timestamp();
    IF v_now < v_sealed THEN
      RAISE EXCEPTION 'sync_pull_clock_regressed';
    END IF;
    EXIT WHEN v_now > v_sealed;
    PERFORM pg_catalog.pg_sleep(0.001);
  END LOOP;
  RETURN v_now;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_write_time_v1()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.stamp_sync_updated_at_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.updated_at := private.sync_write_time_v1();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.stamp_sync_updated_at_v1()
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
