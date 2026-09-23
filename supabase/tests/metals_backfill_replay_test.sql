-- Harness-only pgTAP assertions for the Metals backfill replay harness
-- (scripts/metals-backfill-replay-harness.js). DO NOT run standalone via
-- `supabase test db`: it requires the harness fixtures inserted after the
-- 001-074 replay and before the 075 execution. The harness executes this
-- file after the first 075 run and again after the second 075 run; both
-- executions must pass identically.

BEGIN;

SELECT plan(10);

SELECT is(
  (
    SELECT metal.purity_code || ':' || metal.purity_factor_decimal::text
      || ':' || metal.purity_catalog_version
    FROM public.asset_metals AS metal
    WHERE metal.id = '018f0c7a-1234-7abc-8def-000000000c11'
  ),
  'gold-9167:0.9167:1',
  'stored 22K form backfills the exact gold-9167 tuple'
);
SELECT is(
  (
    SELECT metal.purity_code || ':' || metal.purity_factor_decimal::text
      || ':' || metal.purity_catalog_version
    FROM public.asset_metals AS metal
    WHERE metal.id = '018f0c7a-1234-7abc-8def-000000000c12'
  ),
  'gold-58333:0.58333:1',
  'stored 14K form backfills the exact gold-58333 tuple'
);
SELECT is(
  (
    SELECT metal.purity_code || ':' || metal.purity_factor_decimal::text
      || ':' || metal.purity_catalog_version
    FROM public.asset_metals AS metal
    WHERE metal.id = '018f0c7a-1234-7abc-8def-000000000c17'
  ),
  'silver-925:0.925:1',
  'stored silver form backfills the exact silver-925 tuple'
);
SELECT ok(
  (
    SELECT metal.purity_code IS NULL
      AND metal.purity_factor_decimal IS NULL
      AND metal.purity_catalog_version IS NULL
    FROM public.asset_metals AS metal
    WHERE metal.id = '018f0c7a-1234-7abc-8def-000000000c13'
  ),
  'unmatched 10K purity keeps a wholly null tuple while preserving the holding'
);
SELECT ok(
  (
    SELECT metal.purity_code IS NULL
      AND metal.purity_factor_decimal IS NULL
      AND metal.purity_catalog_version IS NULL
    FROM public.asset_metals AS metal
    WHERE metal.id = '018f0c7a-1234-7abc-8def-000000000c14'
  ),
  'bare 24K 1.0 keeps a null tuple per the forbidden-bare-24K rule'
);
SELECT ok(
  (
    SELECT metal.purity_code IS NULL
      AND metal.purity_factor_decimal IS NULL
      AND metal.purity_catalog_version IS NULL
    FROM public.asset_metals AS metal
    WHERE metal.id = '018f0c7a-1234-7abc-8def-000000000c15'
  ),
  'invalid out-of-catalog fraction keeps a null tuple'
);
SELECT ok(
  (
    SELECT metal.purity_code IS NULL
      AND metal.purity_factor_decimal IS NULL
      AND metal.purity_catalog_version IS NULL
    FROM public.asset_metals AS metal
    WHERE metal.id = '018f0c7a-1234-7abc-8def-000000000c16'
  ),
  'storage-rounded 23.5K keeps a null tuple; only exact 0.97916 is mapped'
);
SELECT is(
  (
    SELECT metal.purity_code || ':' || metal.purity_factor_decimal::text
      || ':' || metal.purity_catalog_version
    FROM public.asset_metals AS metal
    WHERE metal.id = '018f0c7a-1234-7abc-8def-000000000c18'
  ),
  'gold-875:0.875:1',
  'preexisting exact values are never replaced'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.asset_metals AS metal
    WHERE metal.id::text LIKE '018f0c7a-1234-7abc-8def-000000000c%'
      AND metal.weight_grams = 10
      AND metal.purity_fraction IS NOT DISTINCT FROM
        CASE metal.id
          WHEN '018f0c7a-1234-7abc-8def-000000000c11' THEN 0.9167
          WHEN '018f0c7a-1234-7abc-8def-000000000c12' THEN 0.5833
          WHEN '018f0c7a-1234-7abc-8def-000000000c13' THEN 0.4167
          WHEN '018f0c7a-1234-7abc-8def-000000000c14' THEN 1.0
          WHEN '018f0c7a-1234-7abc-8def-000000000c15' THEN -0.5
          WHEN '018f0c7a-1234-7abc-8def-000000000c16' THEN 0.9792
          WHEN '018f0c7a-1234-7abc-8def-000000000c17' THEN 0.925
          WHEN '018f0c7a-1234-7abc-8def-000000000c18' THEN 0.875
        END
  ),
  8::bigint,
  'compatibility columns are retained untouched for every fixture row'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.asset_metals AS metal
    WHERE metal.id::text LIKE '018f0c7a-1234-7abc-8def-000000000c%'
  ),
  8::bigint,
  'every fixture holding is preserved; none hidden or removed'
);

SELECT * FROM finish();
ROLLBACK;
