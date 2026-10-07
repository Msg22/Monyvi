-- Seal ordinary publication and retain only snapshot hard-delete identities.
BEGIN;

CREATE FUNCTION public.seal_sync_pull_v1(p_upper_watermark timestamptz)
RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sealed timestamptz;
  v_market timestamptz;
  v_now timestamptz;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sync_pull_not_authenticated';
  END IF;
  IF p_upper_watermark IS NULL OR NOT isfinite(p_upper_watermark)
    OR p_upper_watermark <> date_trunc('milliseconds', p_upper_watermark) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sync_pull_invalid_watermark';
  END IF;
  SELECT last_sealed_watermark INTO STRICT v_sealed
  FROM private.sync_pull_barrier WHERE singleton FOR UPDATE;
  -- Fresh committed read after the ordinary lock; never acquire a market lock.
  SELECT watermark INTO STRICT v_market
  FROM private.market_rate_publication_barrier WHERE singleton;
  v_now := clock_timestamp();
  IF v_now < v_sealed OR v_now < v_market THEN
    RAISE EXCEPTION 'sync_pull_clock_regressed';
  END IF;
  IF p_upper_watermark > v_now OR p_upper_watermark > v_market THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sync_pull_invalid_watermark';
  END IF;
  UPDATE private.sync_pull_barrier
  SET last_sealed_watermark = greatest(v_sealed, p_upper_watermark)
  WHERE singleton;
  -- An older market cut remains valid; do not substitute the newer ordinary S.
  RETURN p_upper_watermark;
END;
$$;
REVOKE ALL ON FUNCTION public.seal_sync_pull_v1(timestamptz)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seal_sync_pull_v1(timestamptz) TO authenticated;

CREATE TABLE private.sync_snapshot_deletions (
  entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  table_name text NOT NULL CHECK (table_name IN (
    'daily_snapshot_assets', 'daily_snapshot_balance', 'daily_snapshot_net_worth'
  )),
  record_id uuid NOT NULL,
  published_at timestamptz NOT NULL CHECK (isfinite(published_at))
);
CREATE INDEX sync_snapshot_deletions_owner_cursor
ON private.sync_snapshot_deletions(user_id, published_at, entry_id);
ALTER TABLE private.sync_snapshot_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sync_snapshot_deletions
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.stamp_sync_snapshot_created_at_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.created_at := private.sync_write_time_v1();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.stamp_sync_snapshot_created_at_v1()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.publish_sync_snapshot_deletion_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_publication timestamptz;
BEGIN
  v_publication := private.sync_write_time_v1();
  INSERT INTO private.sync_snapshot_deletions(user_id, table_name, record_id, published_at)
  VALUES (OLD.user_id, TG_TABLE_NAME, OLD.id, v_publication);
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION private.publish_sync_snapshot_deletion_v1()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.pull_snapshot_deletions_page_v1(
  p_last_pulled_at timestamptz DEFAULT NULL,
  p_upper_watermark timestamptz DEFAULT NULL,
  p_after_published_at timestamptz DEFAULT NULL,
  p_after_entry_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_sealed timestamptz;
  v_result jsonb;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sync_pull_not_authenticated';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sync_pull_invalid_limit';
  END IF;
  SELECT last_sealed_watermark INTO STRICT v_sealed
  FROM private.sync_pull_barrier WHERE singleton;
  IF p_upper_watermark IS NULL OR NOT isfinite(p_upper_watermark)
    OR p_upper_watermark > v_sealed
    OR p_upper_watermark <> date_trunc('milliseconds', p_upper_watermark)
    OR (p_last_pulled_at IS NOT NULL AND NOT isfinite(p_last_pulled_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sync_pull_invalid_watermark';
  END IF;
  IF (p_after_published_at IS NULL) <> (p_after_entry_id IS NULL)
    OR (p_after_published_at IS NOT NULL AND
      (NOT isfinite(p_after_published_at) OR p_after_published_at > p_upper_watermark)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sync_pull_invalid_cursor';
  END IF;
  WITH remaining AS MATERIALIZED (
    SELECT entry_id, user_id, table_name, record_id, published_at
    FROM private.sync_snapshot_deletions
    WHERE user_id = v_owner
      AND published_at <= p_upper_watermark
      AND (p_last_pulled_at IS NULL OR published_at > p_last_pulled_at)
      AND (p_after_published_at IS NULL OR
        (published_at, entry_id) > (p_after_published_at, p_after_entry_id))
  ), page AS (
    SELECT * FROM remaining ORDER BY published_at, entry_id LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY published_at, entry_id) FROM page), '[]'::jsonb),
    'count', (SELECT count(*) FROM remaining),
    'upperWatermark', p_upper_watermark
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.pull_snapshot_deletions_page_v1(timestamptz, timestamptz, timestamptz, uuid, integer)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pull_snapshot_deletions_page_v1(timestamptz, timestamptz, timestamptz, uuid, integer)
TO authenticated;

-- Rebind explicit timestamp triggers under their existing names and events.
-- Alphabetical execution relative to financial guards is intentionally retained.
DROP TRIGGER account_sms_senders_set_server_insert_updated_at ON public.account_sms_senders;
CREATE TRIGGER account_sms_senders_set_server_insert_updated_at BEFORE INSERT ON public.account_sms_senders
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_account_sms_senders_updated_at ON public.account_sms_senders;
CREATE TRIGGER handle_account_sms_senders_updated_at BEFORE UPDATE ON public.account_sms_senders
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER accounts_set_server_insert_updated_at ON public.accounts;
CREATE TRIGGER accounts_set_server_insert_updated_at BEFORE INSERT ON public.accounts
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_accounts_updated_at ON public.accounts;
CREATE TRIGGER handle_accounts_updated_at BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER asset_metals_set_server_insert_updated_at ON public.asset_metals;
CREATE TRIGGER asset_metals_set_server_insert_updated_at BEFORE INSERT ON public.asset_metals
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_asset_metals_updated_at ON public.asset_metals;
CREATE TRIGGER handle_asset_metals_updated_at BEFORE UPDATE ON public.asset_metals
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER assets_set_server_insert_updated_at ON public.assets;
CREATE TRIGGER assets_set_server_insert_updated_at BEFORE INSERT ON public.assets
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_assets_updated_at ON public.assets;
CREATE TRIGGER handle_assets_updated_at BEFORE UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER bank_details_set_server_insert_updated_at ON public.bank_details;
CREATE TRIGGER bank_details_set_server_insert_updated_at BEFORE INSERT ON public.bank_details
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_bank_details_updated_at ON public.bank_details;
CREATE TRIGGER handle_bank_details_updated_at BEFORE UPDATE ON public.bank_details
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER budgets_set_server_insert_updated_at ON public.budgets;
CREATE TRIGGER budgets_set_server_insert_updated_at BEFORE INSERT ON public.budgets
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_budgets_updated_at ON public.budgets;
CREATE TRIGGER handle_budgets_updated_at BEFORE UPDATE ON public.budgets
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER categories_set_server_insert_updated_at ON public.categories;
CREATE TRIGGER categories_set_server_insert_updated_at BEFORE INSERT ON public.categories
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_categories_updated_at ON public.categories;
CREATE TRIGGER handle_categories_updated_at BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER debts_set_server_insert_updated_at ON public.debts;
CREATE TRIGGER debts_set_server_insert_updated_at BEFORE INSERT ON public.debts
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_debts_updated_at ON public.debts;
CREATE TRIGGER handle_debts_updated_at BEFORE UPDATE ON public.debts
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER profiles_set_server_insert_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_server_insert_updated_at BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_profiles_updated_at ON public.profiles;
CREATE TRIGGER handle_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER recurring_payments_set_server_insert_updated_at ON public.recurring_payments;
CREATE TRIGGER recurring_payments_set_server_insert_updated_at BEFORE INSERT ON public.recurring_payments
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_recurring_payments_updated_at ON public.recurring_payments;
CREATE TRIGGER handle_recurring_payments_updated_at BEFORE UPDATE ON public.recurring_payments
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER transactions_set_server_insert_updated_at ON public.transactions;
CREATE TRIGGER transactions_set_server_insert_updated_at BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_transactions_updated_at ON public.transactions;
CREATE TRIGGER handle_transactions_updated_at BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER transfers_set_server_insert_updated_at ON public.transfers;
CREATE TRIGGER transfers_set_server_insert_updated_at BEFORE INSERT ON public.transfers
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_transfers_updated_at ON public.transfers;
CREATE TRIGGER handle_transfers_updated_at BEFORE UPDATE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

DROP TRIGGER user_category_settings_set_server_insert_updated_at ON public.user_category_settings;
CREATE TRIGGER user_category_settings_set_server_insert_updated_at BEFORE INSERT ON public.user_category_settings
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_user_category_settings_updated_at ON public.user_category_settings;
CREATE TRIGGER handle_user_category_settings_updated_at BEFORE UPDATE ON public.user_category_settings
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

CREATE TRIGGER financial_action_groups_set_server_insert_updated_at BEFORE INSERT ON public.financial_action_groups
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_financial_action_groups_updated_at ON public.financial_action_groups;
CREATE TRIGGER handle_financial_action_groups_updated_at BEFORE UPDATE ON public.financial_action_groups
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

CREATE TRIGGER metal_holding_states_set_server_insert_updated_at BEFORE INSERT ON public.metal_holding_states
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_metal_holding_states_updated_at ON public.metal_holding_states;
CREATE TRIGGER handle_metal_holding_states_updated_at BEFORE UPDATE ON public.metal_holding_states
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

CREATE TRIGGER metal_action_evidence_set_server_insert_updated_at BEFORE INSERT ON public.metal_action_evidence
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_metal_action_evidence_updated_at ON public.metal_action_evidence;
CREATE TRIGGER handle_metal_action_evidence_updated_at BEFORE UPDATE ON public.metal_action_evidence
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

CREATE TRIGGER metal_lifecycle_events_set_server_insert_updated_at BEFORE INSERT ON public.metal_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_metal_lifecycle_events_updated_at ON public.metal_lifecycle_events;
CREATE TRIGGER handle_metal_lifecycle_events_updated_at BEFORE UPDATE ON public.metal_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

CREATE TRIGGER metal_rate_references_set_server_insert_updated_at BEFORE INSERT ON public.metal_rate_references
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_metal_rate_references_updated_at ON public.metal_rate_references;
CREATE TRIGGER handle_metal_rate_references_updated_at BEFORE UPDATE ON public.metal_rate_references
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

CREATE TRIGGER account_financial_effects_set_server_insert_updated_at BEFORE INSERT ON public.account_financial_effects
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER handle_account_financial_effects_updated_at ON public.account_financial_effects;
CREATE TRIGGER handle_account_financial_effects_updated_at BEFORE UPDATE ON public.account_financial_effects
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

CREATE TRIGGER sms_ai_negative_outcomes_set_server_insert_updated_at
BEFORE INSERT ON public.sms_ai_negative_outcomes
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();
DROP TRIGGER update_sms_ai_negative_outcomes_updated_at ON public.sms_ai_negative_outcomes;
CREATE TRIGGER update_sms_ai_negative_outcomes_updated_at
BEFORE UPDATE ON public.sms_ai_negative_outcomes
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_updated_at_v1();

CREATE TRIGGER daily_snapshot_assets_sync_publication
BEFORE INSERT OR UPDATE ON public.daily_snapshot_assets
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_snapshot_created_at_v1();
CREATE TRIGGER daily_snapshot_assets_sync_deletion
BEFORE DELETE ON public.daily_snapshot_assets
FOR EACH ROW EXECUTE FUNCTION private.publish_sync_snapshot_deletion_v1();

CREATE TRIGGER daily_snapshot_balance_sync_publication
BEFORE INSERT OR UPDATE ON public.daily_snapshot_balance
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_snapshot_created_at_v1();
CREATE TRIGGER daily_snapshot_balance_sync_deletion
BEFORE DELETE ON public.daily_snapshot_balance
FOR EACH ROW EXECUTE FUNCTION private.publish_sync_snapshot_deletion_v1();

CREATE TRIGGER daily_snapshot_net_worth_sync_publication
BEFORE INSERT OR UPDATE ON public.daily_snapshot_net_worth
FOR EACH ROW EXECUTE FUNCTION private.stamp_sync_snapshot_created_at_v1();
CREATE TRIGGER daily_snapshot_net_worth_sync_deletion
BEFORE DELETE ON public.daily_snapshot_net_worth
FOR EACH ROW EXECUTE FUNCTION private.publish_sync_snapshot_deletion_v1();

COMMIT;
