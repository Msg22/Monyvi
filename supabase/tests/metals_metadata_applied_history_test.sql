-- Issue #363; TDD contract for the additive applied Name/Notes protocol.
-- Execute only during the local final pre-push gate after the integration owner
-- allocates the numbered SQL migration and the WatermelonDB schema is wired.
BEGIN;
SELECT plan(25);

SELECT has_table(
  'public', 'metal_metadata_edit_outcomes',
  'accepted metadata edit evidence has its own durable server table'
);
SELECT has_column('public', 'metal_metadata_edit_outcomes', 'user_id',
  'outcomes carry owner identity');
SELECT has_column('public', 'metal_metadata_edit_outcomes', 'holding_id',
  'outcomes bind to one owned holding');
SELECT has_column('public', 'metal_metadata_edit_outcomes', 'payload_hash',
  'edit-ID replay binds immutable request content');
SELECT has_column('public', 'metal_metadata_edit_outcomes', 'applied_changes_json',
  'server saves applied before/after rather than submitted intent');
SELECT has_index('public', 'metal_metadata_edit_outcomes',
  'metal_metadata_edit_outcomes_owner_edit_unique',
  'same owner and edit identity cannot generate two outcomes');
SELECT has_function('public', 'apply_metal_metadata_edit_v1',
  ARRAY['text', 'text'], 'new canonical request RPC exists');

SELECT is(
  private.metal_metadata_applied_delta_v1(
    'Gold Bar', NULL, 200, '018f0c7a-1234-7abc-8def-000000000004'::uuid,
    210, '018f0c7a-1234-7abc-8def-000000000004'::uuid,
    'Family Gold', NULL, 220, '018f0c7a-1234-7abc-8def-000000000005'::uuid,
    210, '018f0c7a-1234-7abc-8def-000000000004'::uuid
  ),
  '{"name":{"before":"Gold Bar","after":"Family Gold","clock":{"writtenAt":220,"writerId":"018f0c7a-1234-7abc-8def-000000000005"}}}'::jsonb,
  'only the applied winning Name change is recorded'
);
SELECT is(
  private.metal_metadata_applied_delta_v1(
    'Gold Bar', 'Note', 200, '018f0c7a-1234-7abc-8def-000000000004'::uuid,
    200, '018f0c7a-1234-7abc-8def-000000000004'::uuid,
    'Gold Bar', NULL, 200, '018f0c7a-1234-7abc-8def-000000000004'::uuid,
    220, '018f0c7a-1234-7abc-8def-000000000005'::uuid
  ),
  '{"notes":{"before":"Note","after":null,"clock":{"writtenAt":220,"writerId":"018f0c7a-1234-7abc-8def-000000000005"}}}'::jsonb,
  'exact Notes clearing to SQL null is retained as applied evidence'
);
SELECT is(
  private.metal_metadata_applied_delta_v1(
    'Gold Bar', NULL, 200, '018f0c7a-1234-7abc-8def-000000000004'::uuid,
    210, '018f0c7a-1234-7abc-8def-000000000004'::uuid,
    'Gold Bar', NULL, 220, '018f0c7a-1234-7abc-8def-000000000005'::uuid,
    210, '018f0c7a-1234-7abc-8def-000000000004'::uuid
  ),
  '{}'::jsonb,
  'a newer clock with an identical value is not shown as changed'
);
SELECT is(
  (SELECT relrowsecurity FROM pg_catalog.pg_class
   WHERE oid = 'public.metal_metadata_edit_outcomes'::regclass),
  true, 'outcome table has RLS enabled'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_catalog.pg_policies
   WHERE schemaname = 'public' AND tablename = 'metal_metadata_edit_outcomes'
     AND cmd = 'SELECT' AND qual LIKE '%auth.uid%'),
  1, 'outcome SELECT policy is current-user-scoped'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_catalog.pg_policies
   WHERE schemaname = 'public' AND tablename = 'metal_metadata_edit_outcomes'
     AND cmd IN ('INSERT','UPDATE','DELETE') AND roles @> ARRAY['authenticated']::name[]),
  0, 'clients cannot create or modify adjudicated evidence directly'
);

-- Integration fixtures for durable RPC replay/LWW, no historical reconstruction.
INSERT INTO auth.users (id) VALUES
  ('018f0c7a-1234-7abc-8def-0000000000a1'),
  ('018f0c7a-1234-7abc-8def-0000000000a2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assets (
  id,user_id,name,notes,type,is_liquid,purchase_price,purchase_date,
  currency,purchase_price_decimal,purchase_currency,created_at,updated_at,deleted
) VALUES (
  '018f0c7a-1234-7abc-8def-0000000000a3',
  '018f0c7a-1234-7abc-8def-0000000000a1',
  'Baseline',NULL,'METAL',false,100,'2026-09-01','EGP',
  100,'EGP',now(),now(),false
);
INSERT INTO public.metal_holding_states (
  id,user_id,holding_id,status,financial_revision,effective_event_id,
  effective_action_id,is_visible,reconciliation_state,deleted
) VALUES (
  '018f0c7a-1234-7abc-8def-0000000000a3',
  '018f0c7a-1234-7abc-8def-0000000000a1',
  '018f0c7a-1234-7abc-8def-0000000000a3',
  'active',0,NULL,NULL,true,'accepted',false
);

CREATE TEMP TABLE pg_temp.issue363_requests AS
WITH requests AS (
  SELECT private.financial_action_encode_jsonb_v1(jsonb_build_object(
    'editId','018f0c7a-1234-7abc-8def-0000000000a4',
    'holdingId','018f0c7a-1234-7abc-8def-0000000000a3',
    'userId','018f0c7a-1234-7abc-8def-0000000000a1',
    'linkedActionId',null,'occurredAt','2026-10-10T12:00:00.000Z',
    'fields',jsonb_build_object('name',jsonb_build_object(
      'value','Family Gold','writtenAt','1900000000000',
      'writerId','018f0c7a-1234-7abc-8def-0000000000a4'
    ))
  )) AS request_json, 'winner'::text AS candidate
  UNION ALL
  SELECT private.financial_action_encode_jsonb_v1(jsonb_build_object(
    'editId','018f0c7a-1234-7abc-8def-0000000000a5',
    'holdingId','018f0c7a-1234-7abc-8def-0000000000a3',
    'userId','018f0c7a-1234-7abc-8def-0000000000a1',
    'linkedActionId',null,'occurredAt','2026-10-10T12:01:00.000Z',
    'fields',jsonb_build_object('name',jsonb_build_object(
      'value','Stale candidate','writtenAt','1800000000000',
      'writerId','018f0c7a-1234-7abc-8def-0000000000a5'
    ))
  )) AS request_json, 'loser'::text AS candidate
)
SELECT candidate,request_json,
  encode(extensions.digest(convert_to(request_json,'UTF8'),'sha256'),'hex')
    AS request_hash FROM requests;
GRANT SELECT ON pg_temp.issue363_requests TO authenticated;

SELECT is(
  has_function_privilege(
    'authenticated','public.apply_metal_metadata_patch_v1(uuid,jsonb)','EXECUTE'
  ),false,'legacy projection-only metadata RPC cannot bypass applied evidence'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"018f0c7a-1234-7abc-8def-0000000000a1","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '018f0c7a-1234-7abc-8def-0000000000a1',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT public.apply_metal_metadata_edit_v1(request_json,request_hash) ->> 'status'
   FROM pg_temp.issue363_requests WHERE candidate='winner'),
  'applied','winning edit writes a durable applied outcome'
);
SELECT is(
  (SELECT applied_changes_json #>> '{name,before}'
   FROM public.metal_metadata_edit_outcomes
   WHERE id='018f0c7a-1234-7abc-8def-0000000000a4'),
  'Baseline','server captures exact locked Name before value'
);
SELECT is(
  (SELECT applied_changes_json #>> '{name,after}'
   FROM public.metal_metadata_edit_outcomes
   WHERE id='018f0c7a-1234-7abc-8def-0000000000a4'),
  'Family Gold','server captures exact Name after value'
);
SELECT is(
  (SELECT public.apply_metal_metadata_edit_v1(request_json,request_hash) ->> 'status'
   FROM pg_temp.issue363_requests WHERE candidate='winner'),
  'applied','same edit ID and hash replay stable after acceptance'
);
SELECT is(
  (SELECT public.apply_metal_metadata_edit_v1(request_json,request_hash) ->> 'status'
   FROM pg_temp.issue363_requests WHERE candidate='loser'),
  'ignored','older clock cannot displace accepted Name'
);
SELECT is(
  (SELECT applied_changes_json
   FROM public.metal_metadata_edit_outcomes
   WHERE id='018f0c7a-1234-7abc-8def-0000000000a5'),
  '{}'::jsonb,'stale candidate stores no fabricated applied delta'
);
SELECT is(
  (SELECT financial_revision::text FROM public.metal_holding_states
   WHERE holding_id='018f0c7a-1234-7abc-8def-0000000000a3'),
  '0','metadata-only edits preserve material financial revision'
);
SELECT is(
  (SELECT count(*)::integer FROM public.metal_metadata_edit_outcomes),
  2,'one server outcome per distinct edit despite retries'
);
SELECT throws_ok(
  $query$SELECT public.apply_metal_metadata_edit_v1(request_json,repeat('f',64))
    FROM pg_temp.issue363_requests WHERE candidate='winner'$query$,
  '22023','metal_metadata_edit_payload_hash_mismatch',
  'replaying same edit ID with a changed hash fails closed'
);
SELECT is(
  (SELECT count(*)::integer FROM public.metal_metadata_edit_outcomes),
  2,'hash conflict does not duplicate or rewrite immutable evidence'
);
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"018f0c7a-1234-7abc-8def-0000000000a2","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '018f0c7a-1234-7abc-8def-0000000000a2',
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.metal_metadata_edit_outcomes),
  0,'foreign user cannot read another owner’s metadata outcome'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
