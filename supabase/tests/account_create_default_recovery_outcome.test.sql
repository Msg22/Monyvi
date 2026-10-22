-- #395 T069 Add-only canonical rejection-time default graph, TESTS FIRST.
-- Exact parent 622d1cc9d315dd74e0779c1a2e20bb4d3f6babbb.
-- All identities are synthetic and transactional; no hosted/prod side effects.
-- These are REAL authenticated public RPC outcomes and actual owned SQL rows.
-- Missing canonicalDefaultSnapshot is a behavioral Red, not a missing routine.
BEGIN;
SELECT plan(125);

CREATE FUNCTION pg_temp.a69_id(p_n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('57c97000-0000-4000-8000-'||lpad(p_n::text,12,'0'))::uuid
$$;

CREATE FUNCTION pg_temp.a69_snapshot(p_ids jsonb, p_default uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'activeAccountIds',p_ids,
    'defaultAccount', CASE WHEN p_default IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('accountId',p_default::text,'isDefault',true)
    END)
$$;

-- The canonical public Add envelope is IDENTICAL to existing 091; only
-- frozen synthetic UUIDs, active/default evidence and opening money vary.
CREATE FUNCTION pg_temp.a69_add(
  p_owner uuid, p_action uuid, p_created uuid, p_name text,
  p_opening text, p_expected jsonb, p_default_intent boolean,
  p_effect uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_is_default boolean;
  v_prior text;
  v_records jsonb;
  v_refs jsonb;
  v_effects jsonb := '[]'::jsonb;
  v_guards jsonb := '[]'::jsonb;
BEGIN
  v_is_default := p_default_intent OR
    jsonb_array_length(p_expected->'activeAccountIds')=0;
  v_prior := CASE WHEN p_default_intent
    THEN p_expected->'defaultAccount'->>'accountId'
    ELSE NULL END;
  v_records := jsonb_build_array(jsonb_build_object(
    'entity','account','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object(
      'id',p_created::text,'name',p_name,'type','CASH','currency','EGP',
      'institutionId',null,'providerDisplayName',null,
      'isDefault',v_is_default,'createdAt','2026-09-01T12:00:00.000Z',
      'deleted',false,'openingBalanceMinorUnits',p_opening,
      'targetBalanceMinorUnits',null)));
  IF v_prior IS NOT NULL THEN
    v_records := v_records || jsonb_build_array(jsonb_build_object(
      'entity','account_default','mode','update','expectedIsDefault',true,
      'after',jsonb_build_object('id',v_prior,'isDefault',false)));
  END IF;
  SELECT jsonb_agg(ref.id ORDER BY ref.id COLLATE "C") INTO STRICT v_refs
  FROM (
    SELECT p_created::text AS id
    UNION ALL SELECT v_prior WHERE v_prior IS NOT NULL
  ) AS ref;
  IF p_opening <> '0' THEN
    IF p_effect IS NULL THEN
      RAISE EXCEPTION 'a69_nonzero_requires_real_effect_uuid';
    END IF;
    v_effects := jsonb_build_array(jsonb_build_object(
      'accountId',p_created::text,'amountMinorUnits',p_opening,
      'currency','EGP','effectId',p_effect::text));
    v_guards := jsonb_build_array(jsonb_build_object(
      'accountId',p_created::text,'expectedRevision','0'));
  END IF;
  RETURN jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1',
    'userId',p_owner::text,'actionId',p_action::text,
    'domain','accounts','kind','create_with_default',
    'domainReferenceId',p_created::text,
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','account.create-default/v1',
    'accountGuards',v_guards,
    'payload',jsonb_build_object(
      'schemaVersion','account.create-default/v1',
      'operationCode','account.create-default',
      'defaultIntent',p_default_intent,
      'expectedDefaultSnapshot',p_expected,
      'createGuards',jsonb_build_array(jsonb_build_object(
        'entity','account','id',p_created::text,'expectedAbsent',true)),
      'accountEffects',v_effects,'domainRecordRefs',v_refs,
      'domainMutation',jsonb_build_object('records',v_records)));
END;
$$;

-- Genuine canonical existing-account Review, following the current reviewed
-- T052 fixture wire and SQL validator. No account creation or Add fields.
CREATE FUNCTION pg_temp.a69_review(
  p_owner uuid, p_action uuid, p_account uuid, p_transaction uuid,
  p_category uuid, p_effect uuid
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1',
    'userId',p_owner::text,'actionId',p_action::text,
    'domain','transactions','kind','review_batch_save',
    'domainReferenceId',p_transaction::text,
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','review.batch-save/v1',
    'accountGuards',jsonb_build_array(jsonb_build_object(
      'accountId',p_account::text,'expectedRevision','0')),
    'payload',jsonb_build_object(
      'schemaVersion','review.batch-save/v1',
      'operationCode','review.batch-save','source','VOICE',
      'sessionId',pg_temp.a69_id(9900)::text,
      'frozenIntentDigest',encode(extensions.digest(
        convert_to('a69-voice:'||p_action::text,'UTF8'),'sha256'),'hex'),
      'selectedSourceRefs',jsonb_build_array(jsonb_build_object(
        'rowId',pg_temp.a69_id(9950)::text,
        'recordId',p_transaction::text,'sourceFingerprint',null)),
      'confirmedGroupRefs','[]'::jsonb,
      'createGuards',jsonb_build_array(jsonb_build_object(
        'entity','transaction','id',p_transaction::text,
        'expectedAbsent',true)),
      'accountEffects',jsonb_build_array(jsonb_build_object(
        'accountId',p_account::text,'amountMinorUnits','100',
        'currency','EGP','effectId',p_effect::text)),
      'domainRecordRefs',jsonb_build_array(p_transaction::text),
      'domainMutation',jsonb_build_object('records',jsonb_build_array(
        jsonb_build_object(
          'entity','transaction','mode','create','expectedUpdatedAt',null,
          'after',jsonb_build_object(
            'id',p_transaction::text,'accountId',p_account::text,
            'amountMinorUnits','100','currency','EGP','type','INCOME',
            'categoryId',p_category::text,'counterparty',null,'note',null,
            'date','2026-09-01','source','VOICE','smsFingerprint',null,
            'isDraft',false,'linkedAssetId',null,'linkedDebtId',null,
            'linkedRecurringId',null,'createdAt','2026-09-01T12:00:00.000Z',
            'deleted',false)))),
      'localSmsBookkeeping','[]'::jsonb))
$$;

-- The deployed legacy shape is derived from the same real transaction
-- fixture, stripping only Review-specific wire members as in the existing
-- T052 cross-owner transaction regression; the RPC performs all validation.
CREATE FUNCTION pg_temp.a69_legacy(
  p_owner uuid, p_action uuid, p_account uuid, p_transaction uuid,
  p_category uuid, p_effect uuid
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_review jsonb;
  v_payload jsonb;
BEGIN
  v_review := pg_temp.a69_review(
    p_owner,p_action,p_account,p_transaction,p_category,p_effect);
  v_payload := (v_review->'payload')
    - 'source' - 'sessionId' - 'frozenIntentDigest'
    - 'selectedSourceRefs' - 'confirmedGroupRefs'
    - 'createGuards' - 'localSmsBookkeeping';
  RETURN (v_review - 'kind' - 'payloadVersion' - 'payload')
    || jsonb_build_object(
      'kind','create','payloadVersion','account.balance-effects/v1',
      'payload',v_payload || jsonb_build_object(
        'schemaVersion','account.balance-effects/v1',
        'operationCode','transaction.create'));
END;
$$;

-- Independent physical observer: current authenticated owner's whole active
-- graph, not the input's expectedDefaultSnapshot or financial guard subset.
-- A wrong owner cannot invoke this helper to sample another owner's graph.
CREATE FUNCTION pg_temp.a69_owned_graph(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_ids jsonb;
  v_defaults uuid[];
BEGIN
  IF auth.uid() IS DISTINCT FROM p_owner THEN
    RAISE EXCEPTION 'a69_graph_foreign_actor';
  END IF;
  SELECT coalesce(jsonb_agg(a.id::text ORDER BY a.id::text COLLATE "C"),
    '[]'::jsonb) INTO v_ids
  FROM public.accounts AS a
  WHERE a.user_id=p_owner AND a.deleted=false;
  SELECT array_agg(a.id ORDER BY a.id::text COLLATE "C") INTO v_defaults
  FROM public.accounts AS a
  WHERE a.user_id=p_owner AND a.deleted=false AND a.is_default=true;
  IF coalesce(array_length(v_defaults,1),0)>1 THEN
    RAISE EXCEPTION 'a69_ambiguous_owned_default_graph';
  END IF;
  RETURN pg_temp.a69_snapshot(
    v_ids,CASE WHEN v_defaults IS NULL THEN NULL ELSE v_defaults[1] END);
END;
$$;

CREATE FUNCTION pg_temp.a69_actor(p_owner uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',p_owner::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'sub',p_owner::text,'role','authenticated')::text,true);
END;
$$;

-- A SQLSTATE is a failure, never an invented successful RPC result.
CREATE FUNCTION pg_temp.a69_rpc(p_json text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT public.apply_account_financial_action_v1(p_json,p_hash)
  INTO STRICT v_result;
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status','sqlstate:'||SQLSTATE);
END;
$$;

-- Allocate no persistent namespace. Every account, root, effect and child
-- introduced below belongs to this transaction and is discarded by ROLLBACK.
INSERT INTO auth.users(id,aud,role,email,encrypted_password,
  raw_app_meta_data,raw_user_meta_data)
SELECT pg_temp.a69_id(n),'authenticated','authenticated',
  'sql395-t069-default-'||n||'@monyvi.test','unused','{}','{}'
FROM generate_series(1,19) AS actors(n);

INSERT INTO public.accounts
 (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
VALUES
 (pg_temp.a69_id(201),pg_temp.a69_id(2),'Owner2 Cash A','CASH',10,'EGP',0,false,false),
 (pg_temp.a69_id(202),pg_temp.a69_id(2),'Owner2 Cash B','CASH',20,'EGP',0,false,false),
 (pg_temp.a69_id(301),pg_temp.a69_id(3),'Owner3 A','CASH',10,'EGP',0,false,false),
 (pg_temp.a69_id(302),pg_temp.a69_id(3),'Owner3 B','CASH',20,'EGP',0,true,false),
 (pg_temp.a69_id(401),pg_temp.a69_id(4),'A69 Duplicate Zero','CASH',10,'EGP',0,true,false),
 (pg_temp.a69_id(501),pg_temp.a69_id(5),'A69 Duplicate Nonzero','CASH',20,'EGP',0,false,false),
 (pg_temp.a69_id(901),pg_temp.a69_id(9),'Owner9 Default A','CASH',10,'EGP',0,true,false),
 (pg_temp.a69_id(902),pg_temp.a69_id(9),'Owner9 Default B','CASH',20,'EGP',0,false,false),
 (pg_temp.a69_id(1001),pg_temp.a69_id(10),'A69 Replay Duplicate','CASH',10,'EGP',0,true,false),
 (pg_temp.a69_id(1002),pg_temp.a69_id(10),'Owner10 Default B','CASH',20,'EGP',0,false,false),
 (pg_temp.a69_id(1101),pg_temp.a69_id(11),'Owner11 Collision','CASH',10,'EGP',0,true,false),
 (pg_temp.a69_id(1301),pg_temp.a69_id(13),'Owner13 Foreign ID','CASH',10,'EGP',0,true,false),
 (pg_temp.a69_id(1501),pg_temp.a69_id(15),'Owner15 Review Bank','BANK',100,'EGP',0,true,false),
 (pg_temp.a69_id(1601),pg_temp.a69_id(16),'Owner16 Legacy Bank','BANK',100,'EGP',0,true,false),
 (pg_temp.a69_id(1701),pg_temp.a69_id(17),'Owner17 Stale Review','BANK',100,'EGP',1,true,false);

-- Owner 18 starts empty; owner 19 supplies the real later-to-first OFF case.
INSERT INTO public.accounts
 (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
VALUES (pg_temp.a69_id(1901),pg_temp.a69_id(19),
 'A69 Prior OFF Default','CASH',0,'EGP',0,true,false);

INSERT INTO public.categories(id,user_id,system_name,display_name,icon,level)
SELECT pg_temp.a69_id(700+n),pg_temp.a69_id(n),
  'a69-category-'||n,'A69 Category '||n,'wallet',1
FROM (VALUES (15),(16),(17)) AS owners(n);

CREATE TEMP TABLE a69_inputs (
  case_name text PRIMARY KEY,
  owner_n integer NOT NULL,
  envelope jsonb NOT NULL,
  payload_json text,
  payload_hash text
) ON COMMIT DROP;
CREATE TEMP TABLE a69_outcomes (
  case_name text PRIMARY KEY,
  outcome jsonb NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE a69_graph_witness (
  case_name text PRIMARY KEY,
  graph_before jsonb NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE a69_root_witness (
  case_name text PRIMARY KEY,
  root_before jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO a69_inputs(case_name,owner_n,envelope) VALUES
('stale_empty_zero',1,pg_temp.a69_add(
  pg_temp.a69_id(1),pg_temp.a69_id(5101),pg_temp.a69_id(3101),
  'A69 Stale Empty','0',
  pg_temp.a69_snapshot(jsonb_build_array(pg_temp.a69_id(2199)::text)),
  true)),
('stale_no_default_nonzero',2,pg_temp.a69_add(
  pg_temp.a69_id(2),pg_temp.a69_id(5102),pg_temp.a69_id(3102),
  'A69 Stale Other Active','1001',pg_temp.a69_snapshot('[]'::jsonb),
  true,pg_temp.a69_id(8102))),
('stale_switched_default',3,pg_temp.a69_add(
  pg_temp.a69_id(3),pg_temp.a69_id(5103),pg_temp.a69_id(3103),
  'A69 Stale Prior Default','0',
  pg_temp.a69_snapshot(jsonb_build_array(
    pg_temp.a69_id(301)::text,pg_temp.a69_id(302)::text),
    pg_temp.a69_id(301)),true)),
('duplicate_zero',4,pg_temp.a69_add(
  pg_temp.a69_id(4),pg_temp.a69_id(5104),pg_temp.a69_id(3104),
  'A69 Duplicate Zero','0',
  pg_temp.a69_snapshot(jsonb_build_array(
    pg_temp.a69_id(401)::text),pg_temp.a69_id(401)),true)),
('duplicate_nonzero',5,pg_temp.a69_add(
  pg_temp.a69_id(5),pg_temp.a69_id(5105),pg_temp.a69_id(3105),
  'A69 Duplicate Nonzero','1001',
  pg_temp.a69_snapshot(jsonb_build_array(pg_temp.a69_id(501)::text)),
  false,pg_temp.a69_id(8105))),
('accepted_zero',7,pg_temp.a69_add(
  pg_temp.a69_id(7),pg_temp.a69_id(5107),pg_temp.a69_id(3107),
  'A69 Accepted Zero','0',pg_temp.a69_snapshot('[]'::jsonb),false)),
('accepted_nonzero',8,pg_temp.a69_add(
  pg_temp.a69_id(8),pg_temp.a69_id(5108),pg_temp.a69_id(3108),
  'A69 Accepted Nonzero','1001',pg_temp.a69_snapshot('[]'::jsonb),
  true,pg_temp.a69_id(8108))),
('stale_replay',9,pg_temp.a69_add(
  pg_temp.a69_id(9),pg_temp.a69_id(5109),pg_temp.a69_id(3109),
  'A69 Immutable Stale','0',pg_temp.a69_snapshot('[]'::jsonb),true)),
('rejected_replay',10,pg_temp.a69_add(
  pg_temp.a69_id(10),pg_temp.a69_id(5110),pg_temp.a69_id(3110),
  'A69 Replay Duplicate','0',
  pg_temp.a69_snapshot(jsonb_build_array(
    pg_temp.a69_id(1001)::text,pg_temp.a69_id(1002)::text),
    pg_temp.a69_id(1001)),true)),
('owned_id_collision',11,pg_temp.a69_add(
  pg_temp.a69_id(11),pg_temp.a69_id(5111),pg_temp.a69_id(1101),
  'A69 Own ID Collision','0',pg_temp.a69_snapshot('[]'::jsonb),true)),
('foreign_id_collision',12,pg_temp.a69_add(
  pg_temp.a69_id(12),pg_temp.a69_id(5112),pg_temp.a69_id(1301),
  'A69 Foreign ID Collision','0',pg_temp.a69_snapshot('[]'::jsonb),true)),
('wrong_actor',13,pg_temp.a69_add(
  pg_temp.a69_id(13),pg_temp.a69_id(5113),pg_temp.a69_id(3113),
  'A69 Wrong Actor','0',pg_temp.a69_snapshot('[]'::jsonb),true)),
('malformed',14,jsonb_set(pg_temp.a69_add(
  pg_temp.a69_id(14),pg_temp.a69_id(5114),pg_temp.a69_id(3114),
  'A69 Malformed','0',pg_temp.a69_snapshot('[]'::jsonb),true),
  '{payload,undocumented}','true'::jsonb,true)),
('wrong_hash',14,pg_temp.a69_add(
  pg_temp.a69_id(14),pg_temp.a69_id(5124),pg_temp.a69_id(3124),
  'A69 Wrong Hash','0',pg_temp.a69_snapshot('[]'::jsonb),true)),
('unbound',14,pg_temp.a69_add(
  pg_temp.a69_id(14),pg_temp.a69_id(5134),pg_temp.a69_id(3134),
  'A69 Unbound','0',pg_temp.a69_snapshot('[]'::jsonb),true)),
('review_positive',15,pg_temp.a69_review(
  pg_temp.a69_id(15),pg_temp.a69_id(5115),pg_temp.a69_id(1501),
  pg_temp.a69_id(4115),pg_temp.a69_id(715),pg_temp.a69_id(8115))),
('legacy_positive',16,pg_temp.a69_legacy(
  pg_temp.a69_id(16),pg_temp.a69_id(5116),pg_temp.a69_id(1601),
  pg_temp.a69_id(4116),pg_temp.a69_id(716),pg_temp.a69_id(8116))),
('review_stale',17,pg_temp.a69_review(
  pg_temp.a69_id(17),pg_temp.a69_id(5117),pg_temp.a69_id(1701),
  pg_temp.a69_id(4117),pg_temp.a69_id(717),pg_temp.a69_id(8117)));

-- S2: freeze both OFF-intent payloads before changing their real owner graphs.
-- The malformed companions invert ONLY the frozen account flag; all hashes
-- below are recomputed, so rejection cannot be attributed to a hash mismatch.
INSERT INTO a69_inputs(case_name,owner_n,envelope) VALUES
('off_first_to_later',18,pg_temp.a69_add(
  pg_temp.a69_id(18),pg_temp.a69_id(5218),pg_temp.a69_id(3218),
  'A69 First OFF','0',pg_temp.a69_snapshot('[]'::jsonb),false)),
('off_later_to_first',19,pg_temp.a69_add(
  pg_temp.a69_id(19),pg_temp.a69_id(5219),pg_temp.a69_id(3219),
  'A69 Later OFF','1001',
  pg_temp.a69_snapshot(jsonb_build_array(pg_temp.a69_id(1901)::text),
    pg_temp.a69_id(1901)),false,pg_temp.a69_id(8219))),
('off_first_bad_flag',18,jsonb_set(pg_temp.a69_add(
  pg_temp.a69_id(18),pg_temp.a69_id(5318),pg_temp.a69_id(3318),
  'A69 Bad First OFF','0',pg_temp.a69_snapshot('[]'::jsonb),false),
  '{payload,domainMutation,records,0,after,isDefault}','false'::jsonb,false)),
('off_later_bad_flag',19,jsonb_set(pg_temp.a69_add(
  pg_temp.a69_id(19),pg_temp.a69_id(5319),pg_temp.a69_id(3319),
  'A69 Bad Later OFF','1001',
  pg_temp.a69_snapshot(jsonb_build_array(pg_temp.a69_id(1901)::text),
    pg_temp.a69_id(1901)),false,pg_temp.a69_id(8319)),
  '{payload,domainMutation,records,0,after,isDefault}','true'::jsonb,false));

-- Invoked twice under the actual authenticated owner; 18 assertions per call.
-- Only graph-transition fixtures are written directly. Outcomes and immutable
-- roots come from the real public RPC, with no exception-to-success fallback.
CREATE FUNCTION pg_temp.a69_off_transition(
  p_case text, p_bad_case text, p_existing uuid, p_initially_empty boolean
) RETURNS SETOF text LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_input a69_inputs%ROWTYPE;
  v_bad_input a69_inputs%ROWTYPE;
  v_owner uuid;
  v_action uuid;
  v_bad_action uuid;
  v_created uuid;
  v_bad_created uuid;
  v_expected jsonb;
  v_graph jsonb;
  v_accounts_before jsonb;
  v_accounts_after jsonb;
  v_outcome jsonb;
  v_bad_outcome jsonb;
  v_root_before jsonb;
  v_root_after jsonb;
  v_affected bigint;
BEGIN
  SELECT * INTO STRICT v_input FROM a69_inputs WHERE case_name=p_case;
  SELECT * INTO STRICT v_bad_input FROM a69_inputs WHERE case_name=p_bad_case;
  v_owner := (v_input.envelope->>'userId')::uuid;
  IF auth.uid() IS DISTINCT FROM v_owner
    OR (v_bad_input.envelope->>'userId')::uuid IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'a69_off_foreign_actor';
  END IF;
  v_action := (v_input.envelope->>'actionId')::uuid;
  v_bad_action := (v_bad_input.envelope->>'actionId')::uuid;
  v_created := (v_input.envelope->>'domainReferenceId')::uuid;
  v_bad_created := (v_bad_input.envelope->>'domainReferenceId')::uuid;
  v_expected := v_input.envelope->'payload'->'expectedDefaultSnapshot';

  RETURN NEXT ok(
    v_expected=pg_temp.a69_owned_graph(v_owner)
    AND v_input.envelope->'payload'->'defaultIntent'='false'::jsonb
    AND v_input.envelope->'payload'->'domainMutation'->'records'->0
      ->'after'->'isDefault'=to_jsonb(p_initially_empty),
    p_case||': frozen OFF flag matches the actual initial graph');

  IF p_initially_empty THEN
    INSERT INTO public.accounts
      (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
    VALUES (p_existing,v_owner,'A69 Intervening Account',
      'CASH',0,'EGP',0,true,false);
  ELSE
    UPDATE public.accounts SET deleted=true,is_default=false
    WHERE id=p_existing AND user_id=v_owner AND deleted=false AND is_default=true;
  END IF;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN NEXT is(v_affected,1::bigint,p_case||': real graph transition changed one row');

  v_graph := pg_temp.a69_owned_graph(v_owner);
  RETURN NEXT ok(v_graph IS DISTINCT FROM v_expected,
    p_case||': current graph genuinely differs from the frozen graph');
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id::text COLLATE "C"),
    '[]'::jsonb) INTO v_accounts_before
  FROM public.accounts AS a WHERE a.user_id=v_owner;

  v_outcome := pg_temp.a69_rpc(v_input.payload_json,v_input.payload_hash);
  RETURN NEXT is(v_outcome->>'status','stale',
    p_case||': valid frozen request reaches canonical stale');
  RETURN NEXT is(v_outcome->>'code','ACCOUNT_REVISION_STALE',
    p_case||': stale is not malformed-payload rejection');
  RETURN NEXT is(v_outcome->'canonicalDefaultSnapshot',v_graph,
    p_case||': receipt contains the actual current owned graph');
  RETURN NEXT is(v_outcome->'canonicalAbsentAccountIds',
    jsonb_build_array(v_created::text),
    p_case||': declared creation is positively absent');

  RETURN NEXT is((
    SELECT count(*) FROM public.financial_action_groups AS r
    WHERE r.user_id=v_owner AND r.action_id=v_action
      AND r.domain='accounts' AND r.kind='create_with_default'
      AND r.domain_reference_id=v_created
      AND r.payload_json=v_input.payload_json AND r.payload_hash=v_input.payload_hash
      AND r.account_guards_json::jsonb=v_input.envelope->'accountGuards'
      AND r.state='reconciled' AND r.server_outcome='stale'
      AND r.rejection_code='account_revision_stale'
      AND r.outcome_json::jsonb=v_outcome
  ),1::bigint,p_case||': exact owned immutable request and stale root are stored');
  SELECT to_jsonb(r) INTO v_root_before
  FROM public.financial_action_groups AS r
  WHERE r.user_id=v_owner AND r.action_id=v_action;

  -- Despite the same graph mismatch, a contradictory frozen flag is malformed.
  v_bad_outcome := pg_temp.a69_rpc(v_bad_input.payload_json,v_bad_input.payload_hash);
  RETURN NEXT is(v_bad_outcome->>'status','rejected',
    p_case||': malformed frozen companion is rejected');
  RETURN NEXT is(v_bad_outcome->>'code','INCOMPLETE_GROUP',
    p_case||': malformed flag never receives stale authority');
  RETURN NEXT ok(
    NOT (v_bad_outcome ? 'canonicalDefaultSnapshot')
    AND NOT (v_bad_outcome ? 'canonicalAbsentAccountIds')
    AND NOT (v_bad_outcome ? 'canonicalAccounts'),
    p_case||': malformed refusal contains no canonical recovery evidence');
  RETURN NEXT is((
    SELECT count(*) FROM public.financial_action_groups
    WHERE user_id=v_owner AND action_id=v_bad_action
  ),0::bigint,p_case||': malformed request creates no immutable root');

  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id::text COLLATE "C"),
    '[]'::jsonb) INTO v_accounts_after
  FROM public.accounts AS a WHERE a.user_id=v_owner;
  RETURN NEXT is(v_accounts_after,v_accounts_before,
    p_case||': both RPCs preserve all account fields, balances and revisions');
  RETURN NEXT is((
    SELECT count(*) FROM public.account_financial_effects
    WHERE user_id=v_owner AND action_id IN (v_action,v_bad_action)
  ),0::bigint,p_case||': stale and malformed requests post zero physical effects');

  -- Restore the initial graph, not any immutable root. Exact replay must still
  -- return the stored stale receipt rather than applying the now-current request.
  UPDATE public.accounts
  SET deleted=p_initially_empty,is_default=NOT p_initially_empty
  WHERE id=p_existing AND user_id=v_owner;
  RETURN NEXT is(pg_temp.a69_owned_graph(v_owner),v_expected,
    p_case||': graph matches the original expectation before replay');
  RETURN NEXT is(pg_temp.a69_rpc(v_input.payload_json,v_input.payload_hash),
    v_outcome,p_case||': replay returns the original stale receipt unchanged');
  SELECT to_jsonb(r) INTO v_root_after
  FROM public.financial_action_groups AS r
  WHERE r.user_id=v_owner AND r.action_id=v_action;
  RETURN NEXT is(v_root_after,v_root_before,
    p_case||': replay preserves the entire immutable root');
  RETURN NEXT is((
    SELECT count(*) FROM public.accounts
    WHERE user_id=v_owner AND id IN (v_created,v_bad_created)
  ),0::bigint,p_case||': replay never creates either losing account');
END;
$$;

-- Only privileged synthetic fixture SETUP encodes canonical JSON and SHA.
-- Authenticated test cases below invoke ONLY the real public financial RPC.
UPDATE a69_inputs
SET payload_json=private.financial_action_encode_jsonb_v1(envelope);
UPDATE a69_inputs SET payload_hash=encode(
  extensions.digest(convert_to(payload_json,'UTF8'),'sha256'),'hex');

GRANT SELECT ON a69_inputs TO authenticated;
GRANT SELECT, INSERT ON a69_outcomes TO authenticated;
GRANT SELECT, INSERT ON a69_graph_witness TO authenticated;
GRANT SELECT, INSERT ON a69_root_witness TO authenticated;
SET LOCAL ROLE authenticated;

-- T069-A: authenticated bound Add stale graphs, including the legal empty
-- and nonempty-without-default states. Capture ACTUAL owned rows independently
-- of the request, then execute the same real public RPC as the app.
SELECT pg_temp.a69_actor(pg_temp.a69_id(1));
INSERT INTO a69_graph_witness VALUES
 ('stale_empty_zero',pg_temp.a69_owned_graph(pg_temp.a69_id(1)));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='stale_empty_zero';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='stale_empty_zero'),'stale',
  'A69 zero-opening stale Add reaches real bound stale RPC');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot' FROM a69_outcomes
  WHERE case_name='stale_empty_zero'),(SELECT graph_before FROM a69_graph_witness
  WHERE case_name='stale_empty_zero'),
  'A69 empty owned graph is actual canonical rejection-time authority');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot'->'activeAccountIds'
  FROM a69_outcomes WHERE case_name='stale_empty_zero'),'[]'::jsonb,
  'A69 empty array is valid and not a fabricated new Add account');
SELECT is((SELECT jsonb_typeof(outcome->'canonicalDefaultSnapshot'->'defaultAccount')
  FROM a69_outcomes WHERE case_name='stale_empty_zero'),'null',
  'A69 empty graph requires a genuine JSON null default');

SELECT pg_temp.a69_actor(pg_temp.a69_id(2));
INSERT INTO a69_graph_witness VALUES
 ('stale_no_default_nonzero',pg_temp.a69_owned_graph(pg_temp.a69_id(2)));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='stale_no_default_nonzero';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='stale_no_default_nonzero'),'stale',
  'A69 nonzero-opening stale Add passes bound schema and true stale CAS');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot' FROM a69_outcomes
  WHERE case_name='stale_no_default_nonzero'),
  (SELECT graph_before FROM a69_graph_witness
   WHERE case_name='stale_no_default_nonzero'),
  'A69 full two-account graph with intentionally null default is preserved');
SELECT is((SELECT jsonb_array_length(outcome->'canonicalDefaultSnapshot'
  ->'activeAccountIds') FROM a69_outcomes
  WHERE case_name='stale_no_default_nonzero'),2,
  'A69 nonempty no-default graph includes both owned active members');
SELECT is((SELECT jsonb_typeof(outcome->'canonicalDefaultSnapshot'->'defaultAccount')
  FROM a69_outcomes WHERE case_name='stale_no_default_nonzero'),'null',
  'A69 nonempty owner may intentionally have no active default');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE user_id=pg_temp.a69_id(2) AND action_id=pg_temp.a69_id(5102)),
  0::bigint,'A69 stale nonzero Add posts no speculative opening effect');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE id=pg_temp.a69_id(3102)),0::bigint,
  'A69 stale nonzero Add does not create proposed account');

SELECT pg_temp.a69_actor(pg_temp.a69_id(3));
INSERT INTO a69_graph_witness VALUES
 ('stale_switched_default',pg_temp.a69_owned_graph(pg_temp.a69_id(3)));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='stale_switched_default';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='stale_switched_default'),'stale',
  'A69 actual B default differs from immutable requested A default');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot' FROM a69_outcomes
  WHERE case_name='stale_switched_default'),
  (SELECT graph_before FROM a69_graph_witness
   WHERE case_name='stale_switched_default'),
  'A69 owned graph reads actual new B default, never requested old A');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot'->'defaultAccount'
  FROM a69_outcomes WHERE case_name='stale_switched_default'),
  jsonb_build_object('accountId',pg_temp.a69_id(302)::text,'isDefault',true),
  'A69 canonical default is exact owned B identity with true flag');

-- Closed authority: exact two outer keys, exactly one default with exactly
-- the existing two inner members, sorted distinct active owned account IDs.
SELECT is((SELECT array_agg(key ORDER BY key)
  FROM jsonb_object_keys((SELECT outcome->'canonicalDefaultSnapshot'
    FROM a69_outcomes WHERE case_name='stale_switched_default')) AS key),
  ARRAY['activeAccountIds','defaultAccount']::text[],
  'A69 canonicalDefaultSnapshot has exactly the existing closed two fields');
SELECT is((SELECT array_agg(key ORDER BY key)
  FROM jsonb_object_keys((SELECT outcome->'canonicalDefaultSnapshot'
    ->'defaultAccount' FROM a69_outcomes
    WHERE case_name='stale_switched_default')) AS key),
  ARRAY['accountId','isDefault']::text[],
  'A69 nonnull default member has exact UUID/true keys, no private metadata');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot'->'activeAccountIds'
  FROM a69_outcomes WHERE case_name='stale_switched_default'),
  jsonb_build_array(pg_temp.a69_id(301)::text,pg_temp.a69_id(302)::text),
  'A69 canonical graph uses the complete distinct ASCII-ordered owner IDs');

-- T069-B: real business INSERT violates the existing same-owner
-- manual-account identity unique index (23505). Prior-default clear happens
-- before the attempted new account; the inner savepoint must undo that clear.
SELECT pg_temp.a69_actor(pg_temp.a69_id(4));
INSERT INTO a69_graph_witness VALUES
 ('duplicate_zero',pg_temp.a69_owned_graph(pg_temp.a69_id(4)));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='duplicate_zero';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='duplicate_zero'),'rejected',
  'A69 real zero-opening duplicate identity is an authenticated rejected Add');
SELECT is((SELECT outcome->>'code' FROM a69_outcomes
  WHERE case_name='duplicate_zero'),'DOMAIN_UNIQUE_CONFLICT',
  'A69 physical unique index 23505 maps to exact domain conflict code');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot' FROM a69_outcomes
  WHERE case_name='duplicate_zero'),
  (SELECT graph_before FROM a69_graph_witness WHERE case_name='duplicate_zero'),
  'A69 failure snapshot sees pre-clear default after subtransaction rollback');
SELECT is(pg_temp.a69_owned_graph(pg_temp.a69_id(4)),
  (SELECT graph_before FROM a69_graph_witness WHERE case_name='duplicate_zero'),
  'A69 failed Add leaves actual previous default untouched');
SELECT is((SELECT outcome->'canonicalAbsentAccountIds' FROM a69_outcomes
  WHERE case_name='duplicate_zero'),
  jsonb_build_array(pg_temp.a69_id(3104)::text),
  'A69 canonical absence positively proves losing created account ID missing');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE id=pg_temp.a69_id(3104)),0::bigint,
  'A69 zero-opening conflict rolls back new physical account');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE user_id=pg_temp.a69_id(4) AND action_id=pg_temp.a69_id(5104)),
  0::bigint,'A69 zero opening cannot fabricate a nonzero or zero effect');

SELECT pg_temp.a69_actor(pg_temp.a69_id(5));
INSERT INTO a69_graph_witness VALUES
 ('duplicate_nonzero',pg_temp.a69_owned_graph(pg_temp.a69_id(5)));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='duplicate_nonzero';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='duplicate_nonzero'),'rejected',
  'A69 real nonzero-opening duplicate Add reaches business failure');
SELECT is((SELECT outcome->>'code' FROM a69_outcomes
  WHERE case_name='duplicate_nonzero'),'DOMAIN_UNIQUE_CONFLICT',
  'A69 nonzero duplicate is physical 23505, not unbound NOT_OWNED');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot' FROM a69_outcomes
  WHERE case_name='duplicate_nonzero'),
  (SELECT graph_before FROM a69_graph_witness
   WHERE case_name='duplicate_nonzero'),
  'A69 nonzero rejection captures full true no-default owner graph');
SELECT is((SELECT outcome->'canonicalAbsentAccountIds' FROM a69_outcomes
  WHERE case_name='duplicate_nonzero'),
  jsonb_build_array(pg_temp.a69_id(3105)::text),
  'A69 nonzero losing account absence is positively verified');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE user_id=pg_temp.a69_id(5) AND action_id=pg_temp.a69_id(5105)),
  0::bigint,'A69 failed new nonzero Add leaves zero account-effect rows');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE id=pg_temp.a69_id(3105)),0::bigint,
  'A69 failed nonzero Add leaves physical account absent');

-- Check whole stored root binding to original canonical Add public bytes,
-- hash, owner, reference and EXACT immutable rejection JSON on both paths.
SELECT pg_temp.a69_actor(pg_temp.a69_id(4));
SELECT is((
  SELECT count(*) FROM public.financial_action_groups AS root
  JOIN a69_inputs AS input ON input.case_name='duplicate_zero'
  JOIN a69_outcomes AS result ON result.case_name=input.case_name
  WHERE root.user_id=pg_temp.a69_id(4)
    AND root.action_id=pg_temp.a69_id(5104)
    AND root.domain='accounts' AND root.kind='create_with_default'
    AND root.domain_reference_id=pg_temp.a69_id(3104)
    AND root.payload_json=input.payload_json
    AND root.payload_hash=input.payload_hash
    AND root.account_guards_json::jsonb=input.envelope->'accountGuards'
    AND root.server_outcome='rejected' AND root.state='reconciled'
    AND root.outcome_json::jsonb=result.outcome
),1::bigint,
  'A69 owner-bound zero rejection stores complete immutable tuple/hash/receipt');
SELECT pg_temp.a69_actor(pg_temp.a69_id(5));
SELECT is((
  SELECT count(*) FROM public.financial_action_groups AS root
  JOIN a69_inputs AS input ON input.case_name='duplicate_nonzero'
  JOIN a69_outcomes AS result ON result.case_name=input.case_name
  WHERE root.user_id=pg_temp.a69_id(5)
    AND root.action_id=pg_temp.a69_id(5105)
    AND root.domain='accounts' AND root.kind='create_with_default'
    AND root.domain_reference_id=pg_temp.a69_id(3105)
    AND root.payload_json=input.payload_json
    AND root.payload_hash=input.payload_hash
    AND root.account_guards_json::jsonb=input.envelope->'accountGuards'
    AND root.server_outcome='rejected' AND root.state='reconciled'
    AND root.outcome_json::jsonb=result.outcome
),1::bigint,
  'A69 nonzero rejection stores exact public hash/guards and outcome');

-- T069-C: authenticated stale and rejected receipts must replay the
-- ORIGINAL rejection-time graph even if the same owner subsequently changes
-- default A to B. This explicitly forbids a new graph read on replay.
SELECT pg_temp.a69_actor(pg_temp.a69_id(9));
INSERT INTO a69_graph_witness VALUES
 ('stale_replay',pg_temp.a69_owned_graph(pg_temp.a69_id(9)));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='stale_replay';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='stale_replay'),'stale',
  'A69 original stale receipt is an actual bound Add outcome');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot' FROM a69_outcomes
  WHERE case_name='stale_replay'),
  (SELECT graph_before FROM a69_graph_witness WHERE case_name='stale_replay'),
  'A69 original stale receipt captures initial A default graph');
INSERT INTO a69_root_witness(case_name,root_before)
SELECT 'stale_replay',to_jsonb(root)
FROM public.financial_action_groups AS root
WHERE root.user_id=pg_temp.a69_id(9)
  AND root.action_id=pg_temp.a69_id(5109);
UPDATE public.accounts SET is_default=false
WHERE user_id=pg_temp.a69_id(9) AND id=pg_temp.a69_id(901);
UPDATE public.accounts SET is_default=true
WHERE user_id=pg_temp.a69_id(9) AND id=pg_temp.a69_id(902);
SELECT ok(pg_temp.a69_owned_graph(pg_temp.a69_id(9)) <>
  (SELECT graph_before FROM a69_graph_witness WHERE case_name='stale_replay'),
  'A69 newer actual same-owner default B differs from stored stale receipt');
INSERT INTO a69_outcomes(case_name,outcome)
SELECT 'stale_replayed',pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='stale_replay';
SELECT is((SELECT outcome FROM a69_outcomes WHERE case_name='stale_replayed'),
  (SELECT outcome FROM a69_outcomes WHERE case_name='stale_replay'),
  'A69 stale replay preserves complete original receipt without fresh sampling');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot' FROM a69_outcomes
  WHERE case_name='stale_replayed'),
  (SELECT graph_before FROM a69_graph_witness WHERE case_name='stale_replay'),
  'A69 replayed stale graph is old A, never newer B');
SELECT ok((
  SELECT to_jsonb(root) FROM public.financial_action_groups AS root
  WHERE root.user_id=pg_temp.a69_id(9)
    AND root.action_id=pg_temp.a69_id(5109)
)=(SELECT root_before FROM a69_root_witness WHERE case_name='stale_replay'),
  'A69 stale replay never mutates immutable owner root/bytes/status');

SELECT pg_temp.a69_actor(pg_temp.a69_id(10));
INSERT INTO a69_graph_witness VALUES
 ('rejected_replay',pg_temp.a69_owned_graph(pg_temp.a69_id(10)));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='rejected_replay';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='rejected_replay'),'rejected',
  'A69 original domain-unique rejection is a true bound business result');
SELECT is((SELECT outcome->>'code' FROM a69_outcomes
  WHERE case_name='rejected_replay'),'DOMAIN_UNIQUE_CONFLICT',
  'A69 rejected replay fixture genuinely exercises 23505');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot' FROM a69_outcomes
  WHERE case_name='rejected_replay'),
  (SELECT graph_before FROM a69_graph_witness WHERE case_name='rejected_replay'),
  'A69 rejected receipt stores full pre-clear graph after savepoint rollback');
INSERT INTO a69_root_witness(case_name,root_before)
SELECT 'rejected_replay',to_jsonb(root)
FROM public.financial_action_groups AS root
WHERE root.user_id=pg_temp.a69_id(10)
  AND root.action_id=pg_temp.a69_id(5110);
UPDATE public.accounts SET is_default=false
WHERE user_id=pg_temp.a69_id(10) AND id=pg_temp.a69_id(1001);
UPDATE public.accounts SET is_default=true
WHERE user_id=pg_temp.a69_id(10) AND id=pg_temp.a69_id(1002);
SELECT ok(pg_temp.a69_owned_graph(pg_temp.a69_id(10)) <>
  (SELECT graph_before FROM a69_graph_witness WHERE case_name='rejected_replay'),
  'A69 a later owner-default B is a genuine different physical graph');
INSERT INTO a69_outcomes(case_name,outcome)
SELECT 'rejected_replayed',pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='rejected_replay';
SELECT is((SELECT outcome FROM a69_outcomes WHERE case_name='rejected_replayed'),
  (SELECT outcome FROM a69_outcomes WHERE case_name='rejected_replay'),
  'A69 exact rejected replay returns original immutable receipt');
SELECT is((SELECT outcome->'canonicalDefaultSnapshot' FROM a69_outcomes
  WHERE case_name='rejected_replayed'),
  (SELECT graph_before FROM a69_graph_witness WHERE case_name='rejected_replay'),
  'A69 rejected replay preserves historical A default rather than newer B');
SELECT ok((
  SELECT to_jsonb(root) FROM public.financial_action_groups AS root
  WHERE root.user_id=pg_temp.a69_id(10)
    AND root.action_id=pg_temp.a69_id(5110)
)=(SELECT root_before FROM a69_root_witness WHERE case_name='rejected_replay'),
  'A69 rejected replay cannot rewrite prior root or status');
INSERT INTO a69_outcomes(case_name,outcome)
SELECT 'rejected_wrong_hash',pg_temp.a69_rpc(payload_json,repeat('f',64))
FROM a69_inputs WHERE case_name='rejected_replay';
SELECT is((SELECT outcome->>'code' FROM a69_outcomes
  WHERE case_name='rejected_wrong_hash'),'PAYLOAD_HASH_MISMATCH',
  'A69 same owner/action with a different hash cannot replace rejection');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='rejected_wrong_hash'),
  'A69 unbound hash-mismatch return discloses no canonical default graph');

-- T069-D: an account ID that already exists (whether owned or foreign) is
-- NOT positively absent. These attempts never create a recoverable root and
-- cannot be mistaken for an absent new account in canonicalAbsentAccountIds.
SELECT pg_temp.a69_actor(pg_temp.a69_id(11));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='owned_id_collision';
SELECT is((SELECT outcome->>'code' FROM a69_outcomes
  WHERE case_name='owned_id_collision'),'ACCOUNT_INELIGIBLE',
  'A69 owned physical account ID collision rejects before trusted root binding');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='owned_id_collision'),
  'A69 early owned-ID collision cannot disclose or fabricate canonical graph');
SELECT ok(NOT (SELECT outcome ? 'canonicalAbsentAccountIds'
  FROM a69_outcomes WHERE case_name='owned_id_collision'),
  'A69 existing owned physical account is never reported absent');
SELECT is((SELECT count(*) FROM public.financial_action_groups
  WHERE user_id=pg_temp.a69_id(11) AND action_id=pg_temp.a69_id(5111)),
  0::bigint,'A69 no rejected root is fabricated for early owned collision');

SELECT pg_temp.a69_actor(pg_temp.a69_id(13));
SELECT is((SELECT user_id FROM public.accounts
  WHERE id=pg_temp.a69_id(1301)),pg_temp.a69_id(13),
  'A69 foreign collision ID genuinely exists under another actor');
SELECT pg_temp.a69_actor(pg_temp.a69_id(12));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='foreign_id_collision';
SELECT is((SELECT outcome->>'code' FROM a69_outcomes
  WHERE case_name='foreign_id_collision'),'ACCOUNT_INELIGIBLE',
  'A69 foreign-owned physical UUID cannot be created under this owner');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='foreign_id_collision'),
  'A69 early foreign collision discloses no unverified graph');
SELECT ok(NOT (SELECT outcome ? 'canonicalAbsentAccountIds'
  FROM a69_outcomes WHERE case_name='foreign_id_collision'),
  'A69 foreign existing UUID cannot appear in positive absence proof');
SELECT is((SELECT count(*) FROM public.financial_action_groups
  WHERE user_id=pg_temp.a69_id(12) AND action_id=pg_temp.a69_id(5112)),
  0::bigint,'A69 foreign collision creates no counterfeit owned root');

-- T069-E: malformed, wrong-owner, invalid-hash and unauthenticated requests
-- must not leak active/default graph or impersonate bound Add recovery.
SELECT pg_temp.a69_actor(pg_temp.a69_id(14));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='wrong_actor';
SELECT is((SELECT outcome->>'code' FROM a69_outcomes
  WHERE case_name='wrong_actor'),'NOT_OWNED',
  'A69 valid Add envelope with wrong authenticated actor is not owned');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='wrong_actor'),
  'A69 wrong actor cannot retrieve another owner default graph');
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='malformed';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='malformed'),'rejected',
  'A69 malformed Add returns original explicit rejection, not acceptance');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='malformed'),
  'A69 unregistered extra request key cannot obtain canonical graph');
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,repeat('0',64))
FROM a69_inputs WHERE case_name='wrong_hash';
SELECT is((SELECT outcome->>'code' FROM a69_outcomes
  WHERE case_name='wrong_hash'),'PAYLOAD_HASH_MISMATCH',
  'A69 correct-shape but wrong SHA is unbound and rejected');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='wrong_hash'),
  'A69 failed public payload hash cannot reveal owner graph');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='unbound';
SELECT is((SELECT outcome->>'code' FROM a69_outcomes
  WHERE case_name='unbound'),'NOT_OWNED',
  'A69 caller without authenticated sub cannot bind an Add action');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='unbound'),
  'A69 unauthenticated SQL result must never expose an owned graph');
SELECT pg_temp.a69_actor(pg_temp.a69_id(14));
SELECT is((SELECT count(*) FROM public.financial_action_groups
  WHERE user_id=pg_temp.a69_id(14)
    AND action_id IN (pg_temp.a69_id(5114),pg_temp.a69_id(5124),
      pg_temp.a69_id(5134))),0::bigint,
  'A69 unbound/malformed/hash failures persist no compensable Add root');

-- T069-F: zero- and nonzero-opening Add SUCCESS controls. They must
-- remain accepted/idempotent with their original outcome shape, never carry
-- canonicalDefaultSnapshot, and produce exact physical money/revision effects.
SELECT pg_temp.a69_actor(pg_temp.a69_id(7));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='accepted_zero';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='accepted_zero'),'accepted',
  'A69 real first-account zero-opening Add remains accepted');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='accepted_zero'),
  'A69 accepted zero Add must NOT acquire rejection-only default authority');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE user_id=pg_temp.a69_id(7) AND id=pg_temp.a69_id(3107)
    AND deleted=false AND is_default=true
    AND balance=0 AND financial_revision=0),1::bigint,
  'A69 zero-opening Add creates actual default account at revision zero');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE user_id=pg_temp.a69_id(7) AND action_id=pg_temp.a69_id(5107)),
  0::bigint,'A69 accepted zero Add creates no synthetic effect');
INSERT INTO a69_outcomes(case_name,outcome)
SELECT 'accepted_zero_replay',pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='accepted_zero';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='accepted_zero_replay'),'idempotent',
  'A69 repeat valid zero Add is original idempotent response');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='accepted_zero_replay'),
  'A69 idempotent zero Add never gains canonicalDefaultSnapshot');

SELECT pg_temp.a69_actor(pg_temp.a69_id(8));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='accepted_nonzero';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='accepted_nonzero'),'accepted',
  'A69 real nonzero-opening Add remains accepted');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='accepted_nonzero'),
  'A69 accepted nonzero Add has no rejection-only default graph');
SELECT is((SELECT count(*) FROM public.accounts
  WHERE user_id=pg_temp.a69_id(8) AND id=pg_temp.a69_id(3108)
    AND deleted=false AND is_default=true
    AND balance=10.01 AND financial_revision=1),1::bigint,
  'A69 positive nonzero Add posts exact EGP opening balance/revision1');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE user_id=pg_temp.a69_id(8) AND action_id=pg_temp.a69_id(5108)
    AND id=pg_temp.a69_id(8108) AND account_id=pg_temp.a69_id(3108)
    AND amount_minor_units=1001 AND currency='EGP'
    AND accepted_account_revision=1 AND is_effective),1::bigint,
  'A69 positive nonzero Add has exactly one real effective opening effect');
INSERT INTO a69_outcomes(case_name,outcome)
SELECT 'accepted_nonzero_replay',pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='accepted_nonzero';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='accepted_nonzero_replay'),'idempotent',
  'A69 repeated nonzero Add does not post opening money twice');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='accepted_nonzero_replay'),
  'A69 nonzero idempotent Add remains on the original public outcome shape');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE user_id=pg_temp.a69_id(8) AND action_id=pg_temp.a69_id(5108)),
  1::bigint,'A69 nonzero idempotent replay preserves one physical effect');

-- Review and deployed legacy both use this real RPC but never receive the
-- Add-only outcome key, including accepted/idempotent and Review stale.
SELECT pg_temp.a69_actor(pg_temp.a69_id(15));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='review_positive';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='review_positive'),'accepted',
  'A69 genuine existing-account Review remains accepted');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='review_positive'),
  'A69 accepted Review never receives Add-only default graph');
INSERT INTO a69_outcomes(case_name,outcome)
SELECT 'review_positive_replay',pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='review_positive';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='review_positive_replay'),'idempotent',
  'A69 Review accepted action still replays idempotently');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='review_positive_replay'),
  'A69 idempotent Review never receives default graph');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE user_id=pg_temp.a69_id(15) AND action_id=pg_temp.a69_id(5115)
    AND amount_minor_units=100 AND is_effective),1::bigint,
  'A69 positive Review preserved genuine financial effect');

SELECT pg_temp.a69_actor(pg_temp.a69_id(16));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='legacy_positive';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='legacy_positive'),'accepted',
  'A69 deployed account.balance-effects/v1 transaction still accepts');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='legacy_positive'),
  'A69 accepted deployed legacy outcome has no Add-only key');
INSERT INTO a69_outcomes(case_name,outcome)
SELECT 'legacy_positive_replay',pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='legacy_positive';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='legacy_positive_replay'),'idempotent',
  'A69 deployed legacy accepted action still replays idempotently');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='legacy_positive_replay'),
  'A69 idempotent legacy outcome remains unextended');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE user_id=pg_temp.a69_id(16) AND action_id=pg_temp.a69_id(5116)
    AND amount_minor_units=100 AND is_effective),1::bigint,
  'A69 legacy physical accounting remains a real effective effect');

SELECT pg_temp.a69_actor(pg_temp.a69_id(17));
INSERT INTO a69_outcomes
SELECT case_name,pg_temp.a69_rpc(payload_json,payload_hash)
FROM a69_inputs WHERE case_name='review_stale';
SELECT is((SELECT outcome->>'status' FROM a69_outcomes
  WHERE case_name='review_stale'),'stale',
  'A69 real Review stale financial guard is a bound non-Add outcome');
SELECT ok(NOT (SELECT outcome ? 'canonicalDefaultSnapshot'
  FROM a69_outcomes WHERE case_name='review_stale'),
  'A69 even a real Review stale receipt cannot contain Add-only default key');

-- S2: retain all 89 original assertions above; each real transition below
-- contributes 18 more, including malformed controls and immutable replay.
SELECT pg_temp.a69_actor(pg_temp.a69_id(18));
SELECT * FROM pg_temp.a69_off_transition(
  'off_first_to_later','off_first_bad_flag',pg_temp.a69_id(1801),true);
SELECT pg_temp.a69_actor(pg_temp.a69_id(19));
SELECT * FROM pg_temp.a69_off_transition(
  'off_later_to_first','off_later_bad_flag',pg_temp.a69_id(1901),false);

-- All fixtures were owned and were never committed. No immutable root,
-- action/effect, account or category is deleted to clean up this suite.
SELECT * FROM finish();
ROLLBACK;
