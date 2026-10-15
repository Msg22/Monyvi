-- Local feasibility probe only; no production object or existing row is changed.
-- Execute on supabase_db_Monyvi with psql -X -v ON_ERROR_STOP=1.
BEGIN;
SET LOCAL statement_timeout = '10s';
CREATE TEMP TABLE probe_accounts(id integer PRIMARY KEY, user_id uuid NOT NULL, is_default boolean NOT NULL);
CREATE TEMP TABLE probe_events(event text, op text, row_id integer, row_xmax text);
INSERT INTO probe_accounts VALUES (1, '00000000-0000-0000-0000-000000000395', true);
CREATE FUNCTION pg_temp.probe_statement() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  INSERT INTO pg_temp.probe_events VALUES ('statement', TG_OP, NULL,
    (SELECT xmax::text FROM pg_temp.probe_accounts WHERE id=1));
  PERFORM pg_advisory_xact_lock_shared(395088,0);
  PERFORM pg_advisory_xact_lock(395089,395);
  RETURN NULL;
END $$;
CREATE FUNCTION pg_temp.probe_row() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  INSERT INTO pg_temp.probe_events VALUES ('row', TG_OP, NEW.id,
    (SELECT xmax::text FROM pg_temp.probe_accounts WHERE id=NEW.id));
  RETURN NEW;
END $$;
CREATE TRIGGER probe_statement BEFORE INSERT OR UPDATE OR DELETE ON probe_accounts
FOR EACH STATEMENT EXECUTE FUNCTION pg_temp.probe_statement();
CREATE TRIGGER probe_row BEFORE INSERT OR UPDATE ON probe_accounts
FOR EACH ROW EXECUTE FUNCTION pg_temp.probe_row();
UPDATE probe_accounts SET is_default=false WHERE id=1;
SELECT 'update_trigger_order' AS test, string_agg(event || ':' || op || ':' || coalesce(row_xmax,'null'),',' ORDER BY ctid) AS observed FROM probe_events;
DO $$ BEGIN
  IF (SELECT row_xmax FROM probe_events WHERE event='statement') <> '0'
    OR (SELECT row_xmax FROM probe_events WHERE event='row') <> pg_current_xact_id()::text THEN
    RAISE EXCEPTION 'tuple_lock_order_unexpected';
  END IF;
END $$;
TRUNCATE probe_events;
INSERT INTO probe_accounts VALUES (1,'00000000-0000-0000-0000-000000000395',true)
ON CONFLICT (id) DO UPDATE SET is_default=excluded.is_default;
SELECT 'upsert_trigger_order' AS test, string_agg(event || ':' || op,',' ORDER BY ctid) AS observed FROM probe_events;
DO $$ BEGIN
  IF (SELECT count(*) FROM probe_events WHERE event='statement') <> 2
    OR (SELECT count(*) FROM probe_events WHERE event='row') <> 2 THEN
    RAISE EXCEPTION 'upsert_trigger_order_unexpected';
  END IF;
END $$;
TRUNCATE probe_events;
UPDATE probe_accounts SET is_default=false WHERE id=-1;
SELECT 'zero_row_statement_trigger' AS test, count(*) AS observed FROM probe_events;
DO $$ BEGIN
  IF (SELECT count(*) FROM probe_events WHERE event='statement') <> 1 THEN
    RAISE EXCEPTION 'zero_row_trigger_missing';
  END IF;
END $$;
SELECT 'owner_and_scope_locks_held' AS test, count(*) AS observed
FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'
AND classid IN (395088,395089) AND granted;
ROLLBACK;
SELECT 'rollback_removed_fixture' AS test, to_regclass('pg_temp.probe_accounts') IS NULL AS passed;

