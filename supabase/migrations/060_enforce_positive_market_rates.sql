-- =============================================================================
-- Migration 060: Enforce positive, finite market-rate values
--
-- Pre-production cleanup deliberately deletes invalid rows. A missing or
-- non-positive rate cannot be repaired without inventing financial data.
-- =============================================================================

DO $$
DECLARE
  rate_column text;
  constraint_name text;
BEGIN
  FOREACH rate_column IN ARRAY ARRAY[
    'aed_usd',
    'aud_usd',
    'bhd_usd',
    'btc_usd',
    'cad_usd',
    'chf_usd',
    'cny_usd',
    'dkk_usd',
    'dzd_usd',
    'egp_usd',
    'eur_usd',
    'gbp_usd',
    'hkd_usd',
    'inr_usd',
    'iqd_usd',
    'isk_usd',
    'jod_usd',
    'jpy_usd',
    'kpw_usd',
    'krw_usd',
    'kwd_usd',
    'lyd_usd',
    'mad_usd',
    'myr_usd',
    'nok_usd',
    'nzd_usd',
    'omr_usd',
    'qar_usd',
    'rub_usd',
    'sar_usd',
    'sek_usd',
    'sgd_usd',
    'tnd_usd',
    'try_usd',
    'zar_usd',
    'gold_usd_per_gram',
    'silver_usd_per_gram',
    'platinum_usd_per_gram',
    'palladium_usd_per_gram'
  ] LOOP
    EXECUTE format(
      'DELETE FROM public.market_rates
       WHERE %1$I IS NULL
          OR %1$I <= 0
          OR %1$I::text IN (''NaN'', ''Infinity'', ''-Infinity'')',
      rate_column
    );

    EXECUTE format(
      'ALTER TABLE public.market_rates
         ALTER COLUMN %1$I DROP DEFAULT,
         ALTER COLUMN %1$I SET NOT NULL',
      rate_column
    );

    constraint_name := 'market_rates_' || rate_column || '_positive';
    EXECUTE format(
      'ALTER TABLE public.market_rates DROP CONSTRAINT IF EXISTS %I',
      constraint_name
    );
    EXECUTE format(
      'ALTER TABLE public.market_rates
         ADD CONSTRAINT %1$I CHECK (
           %2$I > 0
           AND %2$I::text NOT IN (''NaN'', ''Infinity'', ''-Infinity'')
         )',
      constraint_name,
      rate_column
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.market_rates IS
  'Cached market data. Every currency and metal rate must be positive and finite.';
