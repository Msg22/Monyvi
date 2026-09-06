BEGIN;

SELECT plan(14);

SELECT has_function(
  'public', 'apply_metal_action_v1', ARRAY['text', 'text'],
  'hardened Metals action RPC remains public'
);
SELECT has_function(
  'public', 'apply_metal_metadata_patch_v1', ARRAY['uuid', 'jsonb'],
  'hardened Metals metadata RPC remains public'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'private.apply_metal_action_v1_pre_285(text,text)',
    'EXECUTE'
  ),
  false,
  'the pre-285 action implementation cannot bypass the public guard'
);

INSERT INTO auth.users (id)
VALUES ('018f0c7a-1234-7abc-8def-000000000285')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"018f0c7a-1234-7abc-8def-000000000285","role":"authenticated"}',
    true
  );
  PERFORM set_config(
    'request.jwt.claim.sub',
    '018f0c7a-1234-7abc-8def-000000000285',
    true
  );
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.issue285_action(
  p_action_id uuid,
  p_kind text,
  p_payload_version text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payload_json text;
BEGIN
  v_payload_json := private.financial_action_encode_jsonb_v1(
    jsonb_build_object(
      'accountGuards', '[]'::jsonb,
      'actionId', p_action_id,
      'domain', 'metals',
      'domainReferenceId', '018f0c7a-1234-7abc-8def-000000000286',
      'envelopeVersion', 'monyvi.financial-action/v1',
      'kind', p_kind,
      'occurredAt', '2026-08-31T10:15:30.123Z',
      'payload', p_payload,
      'payloadVersion', p_payload_version,
      'userId', '018f0c7a-1234-7abc-8def-000000000285'
    )
  );
  RETURN public.apply_metal_action_v1(
    v_payload_json,
    encode(extensions.digest(convert_to(v_payload_json, 'UTF8'), 'sha256'), 'hex')
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION pg_temp.issue285_action(uuid, text, text, jsonb)
  TO authenticated;

SET LOCAL ROLE authenticated;
SELECT is(
  pg_temp.issue285_action(
    '018f0c7a-1234-7abc-8def-000000000287',
    'add',
    'metals.add/v1',
    jsonb_build_object(
      'expectedHoldingRevision', null,
      'holdingId', '018f0c7a-1234-7abc-8def-000000000286',
      'materialFacts', jsonb_build_object(
        'physicalForm', 'JEWELRY',
        'purchaseCurrency', 'EGP',
        'purchaseDate', '2026-08-30',
        'purchasePriceDecimal', '150000',
        'purityCatalogVersion', '1',
        'purityCode', 'gold-9999',
        'purityFactorDecimal', '0.9999',
        'weightGramsDecimal', '10.25'
      ),
      'metadata', jsonb_build_object('name', 'Issue 285 gold', 'notes', null),
      'metalType', 'GOLD',
      'predecessorEventId', null,
      'rateSnapshots', '[]'::jsonb,
      'reversesEventId', null
    )
  ) ->> 'status',
  'accepted',
  'baseline Add succeeds through the hardened wrapper'
);

SELECT throws_ok(
  $$SELECT public.apply_metal_action_v1(
    '{"kind":"sell","payload":{"holdingId":"018f0c7a-1234-7abc-8def-000000000286","saleDate":"2026-08-29"}}',
    repeat('0', 64)
  )$$,
  '22023',
  'metal_sale_before_acquisition',
  'sale date before acquisition is rejected before any server mutation'
);

CREATE TEMPORARY TABLE pg_temp.issue285_stale AS
SELECT pg_temp.issue285_action(
  '018f0c7a-1234-7abc-8def-000000000288',
  'delete',
  'metals.delete/v1',
  jsonb_build_object(
    'expectedHoldingRevision', '1',
    'holdingId', '018f0c7a-1234-7abc-8def-000000000286',
    'predecessorEventId', '018f0c7a-1234-7abc-8def-000000000287',
    'reversesEventId', null
  )
) AS outcome;
SELECT is(
  (SELECT outcome ->> 'status' FROM pg_temp.issue285_stale),
  'stale',
  'a losing holding revision returns stale'
);
SELECT is(
  (SELECT outcome #>> '{canonicalHolding,asset,purchaseDate}' FROM pg_temp.issue285_stale),
  '2026-08-30',
  'stale response carries the canonical material projection'
);
SELECT is(
  (SELECT outcome #>> '{canonicalHolding,state,effectiveActionId}' FROM pg_temp.issue285_stale),
  '018f0c7a-1234-7abc-8def-000000000287',
  'stale response identifies the canonical winning action'
);

SELECT throws_ok(
  $$UPDATE public.assets
    SET purchase_date = '2026-08-31'
    WHERE id = '018f0c7a-1234-7abc-8def-000000000286'$$,
  '22023',
  'metal_action_rpc_required',
  'generic authenticated writes cannot change purchase_date'
);
SELECT throws_ok(
  $$UPDATE public.asset_metals
    SET item_form = 'COIN'
    WHERE asset_id = '018f0c7a-1234-7abc-8def-000000000286'$$,
  '22023',
  'metal_action_rpc_required',
  'generic authenticated writes cannot change item_form'
);

CREATE TEMPORARY TABLE pg_temp.issue285_metadata AS
SELECT public.apply_metal_metadata_patch_v1(
  '018f0c7a-1234-7abc-8def-000000000286',
  jsonb_build_object('fields', jsonb_build_object(
    'name', jsonb_build_object(
      'value', 'Canonical server name',
      'writtenAt', 2000000000000,
      'writerId', '018f0c7a-1234-7abc-8def-000000000289'
    )
  ))
) AS outcome;
SELECT is(
  (SELECT outcome #>> '{canonicalMetadata,name,value}' FROM pg_temp.issue285_metadata),
  'Canonical server name',
  'metadata RPC returns the canonical applied value before acknowledgement'
);

SELECT is(
  public.apply_metal_metadata_patch_v1(
    '018f0c7a-1234-7abc-8def-000000000286',
    jsonb_build_object('fields', jsonb_build_object(
      'name', jsonb_build_object(
        'value', 'Older loser',
        'writtenAt', 1999999999999,
        'writerId', '018f0c7a-1234-7abc-8def-000000000289'
      )
    ))
  ) #>> '{canonicalMetadata,name,value}',
  'Canonical server name',
  'ignored metadata still returns the canonical server winner'
);
SELECT throws_ok(
  $$SELECT public.apply_metal_metadata_patch_v1(
    '018f0c7a-1234-7abc-8def-000000000286',
    jsonb_build_object('fields', jsonb_build_object(
      'name', jsonb_build_object(
        'value', 'Equal-clock conflict',
        'writtenAt', 2000000000000,
        'writerId', '018f0c7a-1234-7abc-8def-000000000289'
      ),
      'notes', jsonb_build_object(
        'value', 'Must not partially apply',
        'writtenAt', 2000000000001,
        'writerId', '018f0c7a-1234-7abc-8def-000000000289'
      )
    ))
  )$$,
  '22023',
  'metal_metadata_tuple_conflict',
  'equal-clock conflict rejects the whole metadata patch'
);
SELECT is(
  (SELECT notes FROM public.assets
    WHERE id = '018f0c7a-1234-7abc-8def-000000000286'),
  null::text,
  'rejected metadata conflict leaves the other field unchanged'
);

SELECT * FROM finish();
ROLLBACK;
