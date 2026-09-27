-- Harness-only state fingerprint for the Metals backfill replay harness.
-- Returns one md5 over every asset_metals row, including updated_at, so the
-- driver can prove an identical second 075 run changes nothing at all.
SELECT md5(string_agg(rowhash, ',' ORDER BY rowhash))
FROM (
  SELECT metal.id::text || '|' || coalesce(metal.purity_code, '')
    || '|' || coalesce(metal.purity_factor_decimal::text, '')
    || '|' || coalesce(metal.purity_catalog_version, '')
    || '|' || metal.weight_grams::text
    || '|' || coalesce(metal.purity_fraction::text, '')
    || '|' || metal.updated_at::text AS rowhash
  FROM public.asset_metals AS metal
) AS rows;
