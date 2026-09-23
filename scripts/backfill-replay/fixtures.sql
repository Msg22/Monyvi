-- Harness-only legacy fixtures for the Metals backfill replay harness.
-- Inserted AFTER replaying supabase/migrations 001-074 and BEFORE executing
-- the actual 075 file, so the real migration backfill processes these rows.
-- Every value is schema-valid: purity_fraction is NUMERIC(5,4) NOT NULL, so
-- legacy 22/24 and 14/24 fractions are represented exactly as stored
-- (0.9167/0.5833); a NULL fraction cannot exist and is not fixtureable.

INSERT INTO auth.users (id)
VALUES ('018f0c7a-1234-7abc-8def-000000000c10')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assets (
  id, user_id, name, type, is_liquid, purchase_price, purchase_date, currency,
  created_at, updated_at, deleted
) VALUES
  ('018f0c7a-1234-7abc-8def-000000000c11',
    '018f0c7a-1234-7abc-8def-000000000c10', 'Replay 22K', 'METAL',
    false, 100, '2026-08-30', 'EGP', now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c12',
    '018f0c7a-1234-7abc-8def-000000000c10', 'Replay 14K', 'METAL',
    false, 100, '2026-08-30', 'EGP', now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c13',
    '018f0c7a-1234-7abc-8def-000000000c10', 'Replay unmatched', 'METAL',
    false, 100, '2026-08-30', 'EGP', now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c14',
    '018f0c7a-1234-7abc-8def-000000000c10', 'Replay bare 24K', 'METAL',
    false, 100, '2026-08-30', 'EGP', now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c15',
    '018f0c7a-1234-7abc-8def-000000000c10', 'Replay invalid', 'METAL',
    false, 100, '2026-08-30', 'EGP', now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c16',
    '018f0c7a-1234-7abc-8def-000000000c10', 'Replay rounded 23.5K', 'METAL',
    false, 100, '2026-08-30', 'EGP', now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c17',
    '018f0c7a-1234-7abc-8def-000000000c10', 'Replay silver', 'METAL',
    false, 100, '2026-08-30', 'EGP', now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c18',
    '018f0c7a-1234-7abc-8def-000000000c10', 'Replay preexisting', 'METAL',
    false, 100, '2026-08-30', 'EGP', now(), now(), false);

INSERT INTO public.asset_metals (
  id, asset_id, metal_type, weight_grams, purity_fraction,
  weight_grams_decimal, purity_code, purity_factor_decimal,
  purity_catalog_version, created_at, updated_at, deleted
) VALUES
  ('018f0c7a-1234-7abc-8def-000000000c11',
    '018f0c7a-1234-7abc-8def-000000000c11', 'GOLD', 10, 0.9167,
    null, null, null, null, now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c12',
    '018f0c7a-1234-7abc-8def-000000000c12', 'GOLD', 10, 0.5833,
    null, null, null, null, now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c13',
    '018f0c7a-1234-7abc-8def-000000000c13', 'GOLD', 10, 0.4167,
    null, null, null, null, now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c14',
    '018f0c7a-1234-7abc-8def-000000000c14', 'GOLD', 10, 1.0,
    null, null, null, null, now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c15',
    '018f0c7a-1234-7abc-8def-000000000c15', 'GOLD', 10, -0.5,
    null, null, null, null, now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c16',
    '018f0c7a-1234-7abc-8def-000000000c16', 'GOLD', 10, 0.9792,
    null, null, null, null, now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c17',
    '018f0c7a-1234-7abc-8def-000000000c17', 'SILVER', 10, 0.925,
    null, null, null, null, now(), now(), false),
  ('018f0c7a-1234-7abc-8def-000000000c18',
    '018f0c7a-1234-7abc-8def-000000000c18', 'GOLD', 10, 0.875,
    10, 'gold-875', 0.875, '1', now(), now(), false);
