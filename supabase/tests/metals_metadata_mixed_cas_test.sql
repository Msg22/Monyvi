-- #363 independent metadata survives a material CAS loser. Local rollback only.
BEGIN;
SELECT plan(20);
INSERT INTO auth.users(id) VALUES ('018f0c7a-1234-7abc-8def-0000000000b1') ON CONFLICT(id) DO NOTHING;
create or replace function pg_temp.apply_metal_test_action(
  p_action_id uuid,
  p_kind text,
  p_payload_version text,
  p_payload jsonb,
  p_holding_id uuid default '018f0c7a-1234-7abc-8def-0000000000b3'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload_json text;
begin
  v_payload_json := private.financial_action_encode_jsonb_v1(
    jsonb_build_object(
      'accountGuards', '[]'::jsonb,
      'actionId', p_action_id,
      'domain', 'metals',
      'domainReferenceId', p_holding_id,
      'envelopeVersion', 'monyvi.financial-action/v1',
      'kind', p_kind,
      'occurredAt', '2026-08-31T10:15:30.123Z',
      'payload', p_payload,
      'payloadVersion', p_payload_version,
      'userId', '018f0c7a-1234-7abc-8def-0000000000b1'
    )
  );
  return public.apply_metal_action_v1(
    v_payload_json,
    encode(extensions.digest(convert_to(v_payload_json, 'UTF8'), 'sha256'), 'hex')
  );
end;
$function$;
grant execute on function pg_temp.apply_metal_test_action(uuid, text, text, jsonb, uuid)
  to authenticated;


SELECT set_config('request.jwt.claim.sub','018f0c7a-1234-7abc-8def-0000000000b1',true);
SELECT set_config('request.jwt.claims','{"sub":"018f0c7a-1234-7abc-8def-0000000000b1","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.apply_metal_test_action('018f0c7a-1234-7abc-8def-0000000000b4', 'add', 'metals.add/v1', '{"expectedHoldingRevision":null,"holdingId":"018f0c7a-1234-7abc-8def-0000000000b3","materialFacts":{"physicalForm":"JEWELRY","purchaseCurrency":"EGP","purchaseDate":"2026-08-30","purchasePriceDecimal":"150000","purityCatalogVersion":"1","purityCode":"gold-9999","purityFactorDecimal":"0.9999","weightGramsDecimal":"10.25"},"metadata":{"name":"Original","notes":"Original note"},"metalType":"GOLD","predecessorEventId":null,"rateSnapshots":[],"reversesEventId":null}'::jsonb)->>'status','accepted','fixture Add accepted');
SELECT is(pg_temp.apply_metal_test_action('018f0c7a-1234-7abc-8def-0000000000b5', 'correct', 'metals.correct/v1', '{"expectedHoldingRevision":"0","holdingId":"018f0c7a-1234-7abc-8def-0000000000b3","materialCorrection":{"before":{"physicalForm":"JEWELRY","purchaseCurrency":"EGP","purchaseDate":"2026-08-30","purchasePriceDecimal":"150000","purityCatalogVersion":"1","purityCode":"gold-9999","purityFactorDecimal":"0.9999","weightGramsDecimal":"10.25"},"after":{"physicalForm":"JEWELRY","purchaseCurrency":"EGP","purchaseDate":"2026-08-30","purchasePriceDecimal":"150000","purityCatalogVersion":"1","purityCode":"gold-9999","purityFactorDecimal":"0.9999","weightGramsDecimal":"11.25"},"reason":"","rateSnapshots":[]},"metadataChange":null,"predecessorEventId":"018f0c7a-1234-7abc-8def-0000000000b4","reversesEventId":null}'::jsonb)->>'status','accepted','material winner accepted');
RESET ROLE;
UPDATE public.metal_holding_states SET name_written_at=1900000000000,name_writer_id='018f0c7a-1234-7abc-8def-0000000000b9' WHERE holding_id='018f0c7a-1234-7abc-8def-0000000000b3';
UPDATE public.assets SET name='Newer Name' WHERE id='018f0c7a-1234-7abc-8def-0000000000b3';
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.apply_metal_test_action('018f0c7a-1234-7abc-8def-0000000000b6', 'correct', 'metals.correct/v1', '{"expectedHoldingRevision":"0","holdingId":"018f0c7a-1234-7abc-8def-0000000000b3","materialCorrection":{"before":{"physicalForm":"JEWELRY","purchaseCurrency":"EGP","purchaseDate":"2026-08-30","purchasePriceDecimal":"150000","purityCatalogVersion":"1","purityCode":"gold-9999","purityFactorDecimal":"0.9999","weightGramsDecimal":"10.25"},"after":{"physicalForm":"JEWELRY","purchaseCurrency":"EGP","purchaseDate":"2026-08-30","purchasePriceDecimal":"150000","purityCatalogVersion":"1","purityCode":"gold-9999","purityFactorDecimal":"0.9999","weightGramsDecimal":"12.25"},"reason":"","rateSnapshots":[]},"metadataChange":{"before":{"name":"Original","notes":"Original note"},"after":{"name":"Independent Name","notes":null}},"predecessorEventId":"018f0c7a-1234-7abc-8def-0000000000b4","reversesEventId":null}'::jsonb)->>'status','stale','financial correction remains stale');
SELECT is((SELECT weight_grams_decimal::text FROM public.asset_metals WHERE asset_id='018f0c7a-1234-7abc-8def-0000000000b3'),'11.25','losing weight unchanged');
SELECT is((SELECT financial_revision::text FROM public.metal_holding_states WHERE holding_id='018f0c7a-1234-7abc-8def-0000000000b3'),'1','metadata does not advance financial CAS');
SELECT is((SELECT applied_changes_json FROM public.metal_metadata_edit_outcomes WHERE id='018f0c7a-1234-7abc-8def-0000000000b6')->'name',NULL::jsonb,'stale Name field not advertised as applied');
SELECT is((SELECT applied_changes_json #> '{notes,after}' FROM public.metal_metadata_edit_outcomes WHERE id='018f0c7a-1234-7abc-8def-0000000000b6'),'null'::jsonb,'winning Notes clear has exact canonical evidence');
SELECT is(pg_temp.apply_metal_test_action('018f0c7a-1234-7abc-8def-0000000000b6', 'correct', 'metals.correct/v1', '{"expectedHoldingRevision":"0","holdingId":"018f0c7a-1234-7abc-8def-0000000000b3","materialCorrection":{"before":{"physicalForm":"JEWELRY","purchaseCurrency":"EGP","purchaseDate":"2026-08-30","purchasePriceDecimal":"150000","purityCatalogVersion":"1","purityCode":"gold-9999","purityFactorDecimal":"0.9999","weightGramsDecimal":"10.25"},"after":{"physicalForm":"JEWELRY","purchaseCurrency":"EGP","purchaseDate":"2026-08-30","purchasePriceDecimal":"150000","purityCatalogVersion":"1","purityCode":"gold-9999","purityFactorDecimal":"0.9999","weightGramsDecimal":"12.25"},"reason":"","rateSnapshots":[]},"metadataChange":{"before":{"name":"Original","notes":"Original note"},"after":{"name":"Independent Name","notes":null}},"predecessorEventId":"018f0c7a-1234-7abc-8def-0000000000b4","reversesEventId":null}'::jsonb)->>'status','stale','stale replay retains financial rejection');
SELECT is((SELECT count(*)::integer FROM public.metal_metadata_edit_outcomes WHERE id='018f0c7a-1234-7abc-8def-0000000000b6'),1,'replay has one immutable metadata outcome');
SELECT is(pg_temp.apply_metal_test_action('018f0c7a-1234-7abc-8def-0000000000b7', 'correct', 'metals.correct/v1', '{"expectedHoldingRevision":"0","holdingId":"018f0c7a-1234-7abc-8def-0000000000b3","materialCorrection":{"before":{"physicalForm":"JEWELRY","purchaseCurrency":"EGP","purchaseDate":"2026-08-30","purchasePriceDecimal":"150000","purityCatalogVersion":"1","purityCode":"gold-9999","purityFactorDecimal":"0.9999","weightGramsDecimal":"10.25"},"after":{"physicalForm":"JEWELRY","purchaseCurrency":"EGP","purchaseDate":"2026-08-30","purchasePriceDecimal":"150000","purityCatalogVersion":"1","purityCode":"gold-9999","purityFactorDecimal":"0.9999","weightGramsDecimal":"12.25"},"reason":"","rateSnapshots":[]},"metadataChange":{"before":{"name":"Original","notes":"Original note"},"after":{"name":"Independent Name","notes":null}},"predecessorEventId":"018f0c7a-1234-7abc-8def-0000000000b8","reversesEventId":null}'::jsonb)->>'code','INVALID_LINK','unknown predecessor has no metadata side effect');
SELECT is((SELECT count(*)::integer FROM public.metal_metadata_edit_outcomes WHERE id='018f0c7a-1234-7abc-8def-0000000000b7'),0,'invalid link never creates outcome');

SELECT is(pg_temp.apply_metal_test_action('018f0c7a-1234-7abc-8def-0000000000ba', 'correct', 'metals.correct/v1', '{"expectedHoldingRevision":"1","holdingId":"018f0c7a-1234-7abc-8def-0000000000b3","materialCorrection":{"before":{"physicalForm":"JEWELRY","purchaseCurrency":"EGP","purchaseDate":"2026-08-30","purchasePriceDecimal":"150000","purityCatalogVersion":"1","purityCode":"gold-9999","purityFactorDecimal":"0.9999","weightGramsDecimal":"11.25"},"after":{"physicalForm":"JEWELRY","purchaseCurrency":"EGP","purchaseDate":"2026-08-30","purchasePriceDecimal":"150000","purityCatalogVersion":"1","purityCode":"gold-9999","purityFactorDecimal":"0.9999","weightGramsDecimal":"13.25"},"reason":"","rateSnapshots":[]},"metadataChange":{"before":{"name":"Stale Name In Payload","notes":"Original note"},"after":{"name":"Losing Candidate Name","notes":"Original note"}},"predecessorEventId":"018f0c7a-1234-7abc-8def-0000000000b5","reversesEventId":null}'::jsonb)->>'status','accepted','matching-CAS material correction succeeds despite stale Name clock');
SELECT is((SELECT weight_grams_decimal::text FROM public.asset_metals WHERE asset_id='018f0c7a-1234-7abc-8def-0000000000b3'),'13.25','winning material correction applied new weight');
SELECT is((SELECT name FROM public.assets WHERE id='018f0c7a-1234-7abc-8def-0000000000b3'),'Newer Name','stale Name candidate does not overwrite newer Name');
SELECT is((SELECT financial_revision::text FROM public.metal_holding_states WHERE holding_id='018f0c7a-1234-7abc-8def-0000000000b3'),'2','valid material correction advances financial revision');
SELECT is((SELECT applied_changes_json FROM public.metal_metadata_edit_outcomes WHERE id='018f0c7a-1234-7abc-8def-0000000000ba')->'name',NULL::jsonb,'losing Name clock produces no applied Name delta');

SELECT is(pg_temp.apply_metal_test_action('018f0c7a-1234-7abc-8def-0000000000bb', 'correct', 'metals.correct/v1', '{"expectedHoldingRevision":"2","holdingId":"018f0c7a-1234-7abc-8def-0000000000b3","materialCorrection":null,"metadataChange":{"before":{"name":"Newer Name","notes":"Original note"},"after":{"name":"Older Attempt","notes":"Original note"}},"predecessorEventId":"018f0c7a-1234-7abc-8def-0000000000ba","reversesEventId":null}'::jsonb)->>'code','INVALID_LINK','pure metadata with losing clock refuses as no-op');
SELECT is((SELECT financial_revision::text FROM public.metal_holding_states WHERE holding_id='018f0c7a-1234-7abc-8def-0000000000b3'),'2','pure metadata no-op preserves financial revision');
SELECT is((SELECT count(*)::integer FROM public.metal_lifecycle_events WHERE action_id='018f0c7a-1234-7abc-8def-0000000000bb'),0,'pure metadata no-op creates no lifecycle event');

SELECT is(pg_temp.apply_metal_test_action('018f0c7a-1234-7abc-8def-0000000000bc', 'correct', 'metals.correct/v1', '{"expectedHoldingRevision":"2","holdingId":"018f0c7a-1234-7abc-8def-0000000000b3","materialCorrection":null,"metadataChange":{"before":{"name":"Fabricated Name","notes":null},"after":{"name":"New Name","notes":null}},"predecessorEventId":"018f0c7a-1234-7abc-8def-0000000000ba","reversesEventId":null}'::jsonb)->>'code','INVALID_LINK','pure metadata with fabricated before facts fails INVALID_LINK');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
