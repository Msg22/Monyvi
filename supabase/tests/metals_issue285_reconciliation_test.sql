BEGIN;

SELECT plan(2);

SELECT like(
  pg_get_functiondef('public.apply_metal_action_v1(text,text)'::regprocedure),
  '%metal_sale_before_acquisition%',
  'server RPC rejects a sale date before acquisition'
);

SELECT like(
  pg_get_functiondef('public.apply_metal_action_v1(text,text)'::regprocedure),
  '%canonicalHolding%',
  'stale RPC outcome carries canonical holding projection for local installation'
);

SELECT * FROM finish();
ROLLBACK;
