-- #395 T052: independent new Review/Add closed-wire and provider/currency boundaries.
-- READ/WRITE only in the local test transaction; all created rows ROLLBACK.
-- No DB roles, triggers, policies or constraints are changed.
BEGIN;
SELECT plan(59);

CREATE FUNCTION pg_temp.b395_id(p_n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('57c92000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.b395_snapshot(p_existing uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'activeAccountIds',CASE WHEN p_existing IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(p_existing) END,
    'defaultAccount',CASE WHEN p_existing IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('accountId',p_existing,'isDefault',true) END)
$$;
CREATE FUNCTION pg_temp.b395_add(
  p_owner uuid, p_action uuid, p_created uuid,
  p_name text, p_type text, p_currency text, p_provider text,
  p_minor text, p_effect_currency text, p_prior uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_record jsonb; v_effects jsonb; v_guards jsonb;
BEGIN
  v_record := jsonb_build_object(
    'entity','account','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object(
      'id',p_created,'name',p_name,'type',p_type,'currency',p_currency,
      'institutionId',null,'providerDisplayName',p_provider,
      'isDefault',p_prior IS NULL,'createdAt','2026-09-01T12:00:00.000Z',
      'deleted',false,'openingBalanceMinorUnits',p_minor,
      'targetBalanceMinorUnits',null));
  v_effects := CASE WHEN p_minor='0' THEN '[]'::jsonb ELSE jsonb_build_array(
    jsonb_build_object('accountId',p_created,'amountMinorUnits',p_minor,
      'currency',p_effect_currency,'effectId',p_action)) END;
  v_guards := CASE WHEN p_minor='0' THEN '[]'::jsonb ELSE jsonb_build_array(
    jsonb_build_object('accountId',p_created,'expectedRevision','0')) END;
  RETURN jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1','userId',p_owner,
    'actionId',p_action,'domain','accounts','kind','create_with_default',
    'domainReferenceId',p_created,'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','account.create-default/v1','accountGuards',v_guards,
    'payload',jsonb_build_object(
      'schemaVersion','account.create-default/v1',
      'operationCode','account.create-default',
      'defaultIntent',p_prior IS NULL,
      'expectedDefaultSnapshot',pg_temp.b395_snapshot(p_prior),
      'createGuards',jsonb_build_array(jsonb_build_object(
        'entity','account','id',p_created,'expectedAbsent',true)),
      'accountEffects',v_effects,'domainRecordRefs',jsonb_build_array(p_created),
      'domainMutation',jsonb_build_object('records',jsonb_build_array(v_record))));
END;
$$;
CREATE FUNCTION pg_temp.b395_review(
  p_owner uuid, p_action uuid, p_account uuid, p_transaction uuid,
  p_category uuid, p_created boolean, p_provider text,
  p_row_id jsonb, p_linked_asset jsonb
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_account jsonb;
  v_tx jsonb;
  v_records jsonb;
  v_guards jsonb;
  v_refs jsonb;
  v_create_guards jsonb;
  v_groups jsonb;
  v_snapshot jsonb := '{}'::jsonb;
BEGIN
  v_tx := jsonb_build_object(
    'entity','transaction','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object(
      'id',p_transaction,'accountId',p_account,'amountMinorUnits','100',
      'currency','EGP','type','INCOME','categoryId',p_category,
      'counterparty',null,'note',null,'date','2026-09-01',
      'source','VOICE','smsFingerprint',null,'isDraft',false,
      'linkedAssetId',p_linked_asset,'linkedDebtId',null,
      'linkedRecurringId',null,'createdAt','2026-09-01T12:00:00.000Z',
      'deleted',false));
  IF p_created THEN
    v_account := jsonb_build_object(
      'entity','account','mode','create','expectedUpdatedAt',null,
      'after',jsonb_build_object(
        'id',p_account,'name','Review Provider Wallet',
        'type','DIGITAL_WALLET','currency','EGP',
        'institutionId',null,'providerDisplayName',p_provider,
        'isDefault',true,'createdAt','2026-09-01T12:00:00.000Z',
        'deleted',false,'openingBalanceMinorUnits','0',
        'targetBalanceMinorUnits',null));
    v_records := jsonb_build_array(v_account,v_tx);
    v_create_guards := jsonb_build_array(
      jsonb_build_object('entity','account','id',p_account,
        'expectedAbsent',true),
      jsonb_build_object('entity','transaction','id',p_transaction,
        'expectedAbsent',true));
    v_refs := jsonb_build_array(p_account,p_transaction);
    v_groups := jsonb_build_array(jsonb_build_object(
      'groupId',p_action,'revision','1','accountId',p_account));
    v_snapshot := jsonb_build_object(
      'creationDefaultSnapshot',pg_temp.b395_snapshot());
  ELSE
    v_records := jsonb_build_array(v_tx);
    v_create_guards := jsonb_build_array(jsonb_build_object(
      'entity','transaction','id',p_transaction,'expectedAbsent',true));
    v_refs := jsonb_build_array(p_transaction);
    v_groups := '[]'::jsonb;
  END IF;
  v_guards := jsonb_build_array(jsonb_build_object(
    'accountId',p_account,'expectedRevision','0'));
  RETURN jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1',
    'userId',p_owner,'actionId',p_action,
    'domain','transactions','kind','review_batch_save',
    'domainReferenceId',p_transaction,
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','review.batch-save/v1',
    'accountGuards',v_guards,
    'payload',jsonb_build_object(
      'schemaVersion','review.batch-save/v1',
      'operationCode','review.batch-save','source','VOICE',
      'sessionId',pg_temp.b395_id(9900),
      'frozenIntentDigest',encode(extensions.digest(
        convert_to('t052-boundary:'||p_action::text,'UTF8'),'sha256'),'hex'),
      'selectedSourceRefs',jsonb_build_array(jsonb_build_object(
        'rowId',p_row_id,'recordId',p_transaction,'sourceFingerprint',null)),
      'confirmedGroupRefs',v_groups,'createGuards',v_create_guards,
      'accountEffects',jsonb_build_array(jsonb_build_object(
        'accountId',p_account,'amountMinorUnits','100',
        'currency','EGP','effectId',p_action)),
      'domainRecordRefs',v_refs,
      'domainMutation',jsonb_build_object('records',v_records),
      'localSmsBookkeeping','[]'::jsonb) || v_snapshot);
END;
$$;
-- R2: adapt the existing canonical Voice transaction fixture to the
-- deployed account.balance-effects/v1 tuple, not a new Review/Add DTO.
-- The transaction create remains a real domain write so an already-used
-- global transaction UUID produces a physical 23505 in the inner savepoint.
CREATE FUNCTION pg_temp.b395_legacy_owner_collision(
  p_owner uuid, p_action uuid, p_account uuid, p_transaction uuid,
  p_category uuid, p_expected_revision text
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_review jsonb;
  v_legacy_payload jsonb;
BEGIN
  v_review := pg_temp.b395_review(
    p_owner, p_action, p_account, p_transaction, p_category,
    false, null, to_jsonb(pg_temp.b395_id(9103)), 'null'::jsonb
  );
  v_legacy_payload := (v_review -> 'payload')
    - 'source' - 'sessionId' - 'frozenIntentDigest'
    - 'selectedSourceRefs' - 'confirmedGroupRefs' - 'createGuards'
    - 'localSmsBookkeeping';
  RETURN (
    v_review - 'kind' - 'payloadVersion' - 'accountGuards' - 'payload'
  ) || jsonb_build_object(
    'kind', 'create',
    'payloadVersion', 'account.balance-effects/v1',
    'accountGuards', jsonb_build_array(jsonb_build_object(
      'accountId', p_account, 'expectedRevision', p_expected_revision
    )),
    'payload', v_legacy_payload || jsonb_build_object(
      'schemaVersion', 'account.balance-effects/v1',
      'operationCode', 'transaction.create'
    )
  );
END;
$$;

CREATE FUNCTION pg_temp.b395_raw_rpc(
  p_payload_json text,p_payload_hash text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT public.apply_account_financial_action_v1(p_payload_json,p_payload_hash)
  INTO STRICT v_result;
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  -- Every unexpected SQLSTATE becomes an explicit FAIL against required
  -- accepted/rejected outcomes, never a synthesized success or stale.
  RETURN jsonb_build_object('status','sqlstate:'||SQLSTATE);
END;
$$;
CREATE FUNCTION pg_temp.b395_direct_add(p_envelope jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM private.financial_action_validate_account_create_default_payload_v1(
    p_envelope->'payload',p_envelope->>'domainReferenceId');
  RETURN 'valid_shape';
EXCEPTION WHEN SQLSTATE '22023' THEN RETURN 'invalid_shape';
WHEN OTHERS THEN RETURN 'sqlstate:'||SQLSTATE;
END;
$$;
CREATE FUNCTION pg_temp.b395_direct_review(p_envelope jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM private.financial_action_validate_review_batch_save_payload_v1(
    p_envelope->'payload',p_envelope->>'domainReferenceId');
  RETURN 'valid_shape';
EXCEPTION WHEN SQLSTATE '22023' THEN RETURN 'invalid_shape';
WHEN OTHERS THEN RETURN 'sqlstate:'||SQLSTATE;
END;
$$;
CREATE FUNCTION pg_temp.b395_actor(p_owner uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',p_owner::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',p_owner,'role','authenticated')::text,true);
END;
$$;
CREATE FUNCTION pg_temp.b395_deferred()
RETURNS text LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN 'sqlstate:'||SQLSTATE;
END;
$$;

-- Independent owned actors: no accepted financial root is committed.
INSERT INTO auth.users(id,aud,role,email,encrypted_password,
  raw_app_meta_data,raw_user_meta_data)
SELECT pg_temp.b395_id(n),'authenticated','authenticated',
  'sql395-boundary-'||n||'@monyvi.test','unused','{}','{}'
FROM generate_series(1,12) AS actors(n);
INSERT INTO public.accounts
 (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
VALUES
 (pg_temp.b395_id(205),pg_temp.b395_id(5),'Cash','CASH',10,'EGP',0,true,false),
 (pg_temp.b395_id(206),pg_temp.b395_id(6),'Cash','CASH',10,'EGP',0,true,false),
 (pg_temp.b395_id(207),pg_temp.b395_id(7),'Bank Seven','BANK',10,'EGP',0,true,false),
 (pg_temp.b395_id(208),pg_temp.b395_id(8),'Bank Eight','BANK',10,'EGP',0,true,false),
 (pg_temp.b395_id(209),pg_temp.b395_id(9),'Bank Nine','BANK',10,'EGP',0,true,false),
 (pg_temp.b395_id(211),pg_temp.b395_id(11),'Bank Eleven','BANK',10,'EGP',0,true,false);
INSERT INTO public.categories(id,user_id,system_name,display_name,icon,level)
SELECT pg_temp.b395_id(700+n),pg_temp.b395_id(n),
  'boundary-'||n,'Boundary '||n,'wallet',1
FROM (VALUES (4),(7),(8),(9),(11)) AS actor(n);

-- Real foreign-owned asset: its FK is valid, so F4 cannot pass simply
-- because a nonexistent linked asset causes a physical FK failure.
INSERT INTO public.assets(id,user_id,name,type,is_liquid,
 purchase_price,purchase_date,currency,deleted)
VALUES (pg_temp.b395_id(9008),pg_temp.b395_id(10),
 'Foreign Owned Real Estate','REAL_ESTATE',false,
 100,'2026-09-01','EGP',false);


CREATE TEMP TABLE boundary_inputs (
  case_name text PRIMARY KEY, owner_n integer NOT NULL, envelope jsonb NOT NULL,
  payload_json text, payload_hash text
) ON COMMIT DROP;
CREATE TEMP TABLE boundary_outcomes(
  case_name text PRIMARY KEY, outcome jsonb NOT NULL
) ON COMMIT DROP;
-- Keep full synthetic root bytes privately within this rolled-back SQL suite.
CREATE TEMP TABLE boundary_root_proofs(
  proof_name text PRIMARY KEY, root_before jsonb NOT NULL
) ON COMMIT DROP;
INSERT INTO boundary_inputs(case_name,owner_n,envelope) VALUES
('add_egp_good',1,pg_temp.b395_add(pg_temp.b395_id(1),pg_temp.b395_id(1001),
 pg_temp.b395_id(3001),'Opening EGP','CASH','EGP',null,'1001','EGP')),
('add_currency_mismatch',2,pg_temp.b395_add(pg_temp.b395_id(2),
 pg_temp.b395_id(1002),pg_temp.b395_id(3002),'Opening EGP','CASH','EGP',
 null,'1001','USD')),
('add_provider',3,pg_temp.b395_add(pg_temp.b395_id(3),pg_temp.b395_id(1003),
 pg_temp.b395_id(3003),'Manual Wallet','DIGITAL_WALLET','EGP',
 'Manual Wallet Provider','0','EGP')),
('review_provider',4,pg_temp.b395_review(pg_temp.b395_id(4),
 pg_temp.b395_id(1004),pg_temp.b395_id(3004),pg_temp.b395_id(4004),
 pg_temp.b395_id(704),true,'Review Wallet Provider',
 to_jsonb(pg_temp.b395_id(5004)),'null'::jsonb)),
('add_cash_usd_same_name',5,pg_temp.b395_add(pg_temp.b395_id(5),
 pg_temp.b395_id(1005),pg_temp.b395_id(3005),
 'Cash','CASH','USD',null,'0','USD',pg_temp.b395_id(205))),
('add_cash_usd_distinct_name',6,pg_temp.b395_add(pg_temp.b395_id(6),
 pg_temp.b395_id(1006),pg_temp.b395_id(3006),
 'USD Savings','CASH','USD',null,'0','USD',pg_temp.b395_id(206))),
('review_link_null_good',7,pg_temp.b395_review(pg_temp.b395_id(7),
 pg_temp.b395_id(1007),pg_temp.b395_id(207),pg_temp.b395_id(4007),
 pg_temp.b395_id(707),false,null,
 to_jsonb(pg_temp.b395_id(5007)),'null'::jsonb)),
('review_link_nonnull',8,pg_temp.b395_review(pg_temp.b395_id(8),
 pg_temp.b395_id(1008),pg_temp.b395_id(208),pg_temp.b395_id(4008),
 pg_temp.b395_id(708),false,null,
 to_jsonb(pg_temp.b395_id(5008)),to_jsonb(pg_temp.b395_id(9008)))),
('review_rowid_null',9,pg_temp.b395_review(pg_temp.b395_id(9),
 pg_temp.b395_id(1009),pg_temp.b395_id(209),pg_temp.b395_id(4009),
 pg_temp.b395_id(709),false,null,'null'::jsonb,'null'::jsonb)),
('review_rowid_good',11,pg_temp.b395_review(pg_temp.b395_id(11),
 pg_temp.b395_id(1011),pg_temp.b395_id(211),pg_temp.b395_id(4011),
 pg_temp.b395_id(711),false,null,
 to_jsonb(pg_temp.b395_id(5011)),'null'::jsonb));
INSERT INTO boundary_inputs(case_name,owner_n,envelope)
SELECT 'add_effect_extra_key',12,jsonb_set(
  pg_temp.b395_add(pg_temp.b395_id(12),pg_temp.b395_id(1012),
    pg_temp.b395_id(3012),'Extra Effect','CASH','EGP',null,'1001','EGP'),
  '{payload,accountEffects,0,undocumented}','"extra"'::jsonb,true);

-- Owner B (3) already has a genuine accepted Add action K=1003 below.
-- Owner A (7) reuses K for a valid legacy transaction.create whose global
-- transaction UUID 4011 was created by owner 11. The transaction's primary
-- key must raise 23505 inside the domain savepoint, with owner-local roots.
INSERT INTO boundary_inputs(case_name,owner_n,envelope) VALUES
('owner_collision_legacy',7,pg_temp.b395_legacy_owner_collision(
  pg_temp.b395_id(7),pg_temp.b395_id(1003),pg_temp.b395_id(207),
  pg_temp.b395_id(4011),pg_temp.b395_id(707),'1'));

-- Canonical hash work is a privileged fixture SETUP only; authenticated
-- role has no private-schema USAGE and calls ONLY the actual public RPC.
UPDATE boundary_inputs
SET payload_json=private.financial_action_encode_jsonb_v1(envelope);
UPDATE boundary_inputs
SET payload_hash=encode(
  extensions.digest(convert_to(payload_json,'UTF8'),'sha256'),'hex');

SELECT is((SELECT user_id FROM public.assets
 WHERE id=pg_temp.b395_id(9008)),pg_temp.b395_id(10),
 'F4 linked asset FK fixture exists and belongs to a DIFFERENT real owner');

-- Source-shape proof: privileged direct validators differentiate F4/F5 from
-- unrelated physical FK failure after SQL has already admitted the malformed row.
SELECT is(pg_temp.b395_direct_add((SELECT envelope FROM boundary_inputs
 WHERE case_name='add_egp_good')), 'valid_shape',
 'F3 good Add EGP effect is a valid positive control');
SELECT is(pg_temp.b395_direct_add((SELECT envelope FROM boundary_inputs
 WHERE case_name='add_currency_mismatch')), 'invalid_shape',
 'F3 Add validator rejects the wrong effect currency before writes');
SELECT is(pg_temp.b395_direct_add((SELECT envelope FROM boundary_inputs
 WHERE case_name='add_effect_extra_key')), 'invalid_shape',
 'F3 Add validator rejects a surplus effect key');
SELECT is(pg_temp.b395_direct_review((SELECT envelope FROM boundary_inputs
 WHERE case_name='review_link_null_good')), 'valid_shape',
 'F4 valid null-only linked transaction passes review schema');
SELECT is(pg_temp.b395_direct_review((SELECT envelope FROM boundary_inputs
 WHERE case_name='review_link_nonnull')), 'invalid_shape',
 'F4 nonnull linked asset ID fails in validator, not merely physical FK');
SELECT is(pg_temp.b395_direct_review((SELECT envelope FROM boundary_inputs
 WHERE case_name='review_rowid_good')), 'valid_shape',
 'F5 valid source row UUID passes canonical review validation');
SELECT is(pg_temp.b395_direct_review((SELECT envelope FROM boundary_inputs
 WHERE case_name='review_rowid_null')), 'invalid_shape',
 'F5 JSON-null selected row ID cannot evade nullable regex checks');

GRANT SELECT ON boundary_inputs TO authenticated;
GRANT SELECT, INSERT ON boundary_outcomes TO authenticated;
GRANT SELECT, INSERT ON boundary_root_proofs TO authenticated;
SET LOCAL ROLE authenticated;

SELECT pg_temp.b395_actor(pg_temp.b395_id(1));
INSERT INTO boundary_outcomes SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='add_egp_good';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
 WHERE case_name='add_egp_good'),'accepted','F3 EGP Add positive accepted');
SELECT is((SELECT balance FROM public.accounts WHERE id=pg_temp.b395_id(3001)),
 10.01::numeric,'F3 accepted Add stores exact EGP 10.01');
SELECT is((SELECT financial_revision FROM public.accounts
 WHERE id=pg_temp.b395_id(3001)),1::bigint,
 'F3 accepted Add increments new account revision exactly once');
SELECT is((SELECT count(*) FROM public.account_financial_effects
 WHERE action_id=pg_temp.b395_id(1001) AND currency='EGP'
 AND amount_minor_units=1001),1::bigint,
 'F3 accepted Add posts one canonical EGP effect');

SELECT pg_temp.b395_actor(pg_temp.b395_id(2));
INSERT INTO boundary_outcomes SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='add_currency_mismatch';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
 WHERE case_name='add_currency_mismatch'),'rejected',
 'F3 USD effect with EGP opening must reject atomically');
SELECT is((SELECT count(*) FROM public.accounts
 WHERE id=pg_temp.b395_id(3002)),0::bigint,
 'F3 bad currency leaves created account absent');
SELECT is((SELECT count(*) FROM public.financial_action_groups
 WHERE action_id=pg_temp.b395_id(1002) AND server_outcome='accepted'),
 0::bigint,'F3 wrong currency has no accepted root');
SELECT is((SELECT count(*) FROM public.account_financial_effects
 WHERE action_id=pg_temp.b395_id(1002)),0::bigint,
 'F3 wrong currency posts no physical effect');

SELECT pg_temp.b395_actor(pg_temp.b395_id(12));
INSERT INTO boundary_outcomes SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='add_effect_extra_key';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
 WHERE case_name='add_effect_extra_key'),'rejected',
 'F3 unexpected account effect key rejected through real RPC');
SELECT is((SELECT count(*) FROM public.accounts
 WHERE id=pg_temp.b395_id(3012)),0::bigint,
 'F3 surplus key cannot materialize a new account');
SELECT is((SELECT count(*) FROM public.financial_action_groups
 WHERE action_id=pg_temp.b395_id(1012) AND server_outcome='accepted'),
 0::bigint,'F3 surplus key never yields accepted root');

SELECT pg_temp.b395_actor(pg_temp.b395_id(3));
INSERT INTO boundary_outcomes SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='add_provider';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
 WHERE case_name='add_provider'),'accepted',
 'F6 valid zero-opening provider Add accepted');
SELECT is((SELECT provider_display_name FROM public.accounts
 WHERE id=pg_temp.b395_id(3003)),'Manual Wallet Provider',
 'F6 Add persists approved provider identity exactly');
SELECT is((SELECT institution_id FROM public.accounts
 WHERE id=pg_temp.b395_id(3003)),NULL::text,
 'F6 Add null institution ID stays null; no inference');

SELECT pg_temp.b395_actor(pg_temp.b395_id(4));
INSERT INTO boundary_outcomes SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='review_provider';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
 WHERE case_name='review_provider'),'accepted',
 'F6 valid first-account Review Wallet and transaction accepted');
SELECT is((SELECT provider_display_name FROM public.accounts
 WHERE id=pg_temp.b395_id(3004)),'Review Wallet Provider',
 'F6 Review new account preserves grounded provider identity');
SELECT is((SELECT count(*) FROM public.account_financial_effects
 WHERE action_id=pg_temp.b395_id(1004) AND is_effective),
 1::bigint,'F6 Review creates one genuine immutable financial effect');

SELECT pg_temp.b395_actor(pg_temp.b395_id(7));
INSERT INTO boundary_outcomes SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='review_link_null_good';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
 WHERE case_name='review_link_null_good'),'accepted',
 'F4 valid no-linked-record Review positive accepts');
SELECT is((SELECT linked_asset_id FROM public.transactions
 WHERE id=pg_temp.b395_id(4007)),NULL::uuid,
 'F4 positive Review physically persists null linked asset');
SELECT is((SELECT financial_revision FROM public.accounts
 WHERE id=pg_temp.b395_id(207)),1::bigint,
 'F4 positive Review increments owned financial revision once');

SELECT pg_temp.b395_actor(pg_temp.b395_id(8));
INSERT INTO boundary_outcomes SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='review_link_nonnull';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
 WHERE case_name='review_link_nonnull'),'rejected',
 'F4 nonnull linked asset must reject via real RPC');
SELECT is((SELECT count(*) FROM public.transactions
 WHERE id=pg_temp.b395_id(4008)),0::bigint,
 'F4 foreign owned linked asset never creates transaction');
SELECT is((SELECT financial_revision FROM public.accounts
 WHERE id=pg_temp.b395_id(208)),0::bigint,
 'F4 rejected linked asset leaves owner balance revision unchanged');
SELECT is((SELECT count(*) FROM public.account_financial_effects
 WHERE action_id=pg_temp.b395_id(1008)),0::bigint,
 'F4 cross-owner linked asset cannot post an immutable financial effect');

SELECT pg_temp.b395_actor(pg_temp.b395_id(9));
INSERT INTO boundary_outcomes SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='review_rowid_null';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
 WHERE case_name='review_rowid_null'),'rejected',
 'F5 JSON-null source row ID rejects in actual RPC');
SELECT is((SELECT count(*) FROM public.financial_action_groups
 WHERE action_id=pg_temp.b395_id(1009) AND server_outcome='accepted'),
 0::bigint,'F5 malformed rowId has no accepted root');
SELECT is((SELECT financial_revision FROM public.accounts
 WHERE id=pg_temp.b395_id(209)),0::bigint,
 'F5 bad rowId cannot post an account revision');

SELECT pg_temp.b395_actor(pg_temp.b395_id(11));
INSERT INTO boundary_outcomes SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='review_rowid_good';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
 WHERE case_name='review_rowid_good'),'accepted',
 'F5 genuine rowId Review positive accepted');
SELECT is((SELECT count(*) FROM public.transactions
 WHERE id=pg_temp.b395_id(4011) AND account_id=pg_temp.b395_id(211)),
 1::bigint,'F5 positive binds one actual financial record');

SELECT pg_temp.b395_actor(pg_temp.b395_id(5));
INSERT INTO boundary_outcomes SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='add_cash_usd_same_name';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
 WHERE case_name='add_cash_usd_same_name'),'accepted',
 'F7 second Cash same name, distinct USD currency must be accepted');
SELECT is((SELECT count(*) FROM public.accounts
 WHERE user_id=pg_temp.b395_id(5) AND name='Cash' AND NOT deleted),
 2::bigint,'F7 EGP and USD Cash coexist as distinct owned identities');
SELECT is((SELECT id FROM public.accounts
 WHERE user_id=pg_temp.b395_id(5) AND is_default AND NOT deleted),
 pg_temp.b395_id(205),'F7 later OFF preserves existing EGP default');

SELECT pg_temp.b395_actor(pg_temp.b395_id(6));
INSERT INTO boundary_outcomes SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='add_cash_usd_distinct_name';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
 WHERE case_name='add_cash_usd_distinct_name'),'accepted',
 'F7 distinct-name USD Cash positive accepted');
SELECT is((SELECT count(*) FROM public.accounts
 WHERE user_id=pg_temp.b395_id(6) AND currency='USD' AND NOT deleted),
 1::bigint,'F7 valid other-currency account physically persisted');
SELECT is((SELECT id FROM public.accounts
 WHERE user_id=pg_temp.b395_id(6) AND is_default AND NOT deleted),
 pg_temp.b395_id(206),'F7 good later OFF preserves first default');

-- R2: a shared action UUID may name TWO independently owned roots.
-- The B root is a genuine accepted Add created above, not a manufactured
-- financial-action row. The A legacy transaction targets a physically used
-- transaction UUID in owner 11's namespace, so its domain INSERT fails 23505
-- inside the inner savepoint. The outer owner/root scope must survive and
-- persist canonical A rejection evidence without changing B's immutable root.
SELECT pg_temp.b395_actor(pg_temp.b395_id(3));
INSERT INTO boundary_root_proofs(proof_name,root_before)
SELECT 'owner_b',to_jsonb(root)
FROM public.financial_action_groups AS root
WHERE root.user_id=pg_temp.b395_id(3)
  AND root.action_id=pg_temp.b395_id(1003)
  AND root.server_outcome='accepted';
SELECT is((SELECT count(*) FROM boundary_root_proofs
  WHERE proof_name='owner_b'),1::bigint,
  'R2 owner B has a genuine accepted Add root K before the collision');

SELECT pg_temp.b395_actor(pg_temp.b395_id(11));
SELECT is((SELECT user_id FROM public.transactions
  WHERE id=pg_temp.b395_id(4011)),pg_temp.b395_id(11),
  'R2 the colliding transaction UUID really belongs to owner 11');

SELECT pg_temp.b395_actor(pg_temp.b395_id(7));
SELECT is((SELECT count(*) FROM public.financial_action_groups
  WHERE user_id=pg_temp.b395_id(7)
    AND action_id=pg_temp.b395_id(1003)),0::bigint,
  'R2 owner A initially has no local root K to replay or overwrite');
INSERT INTO boundary_outcomes(case_name,outcome)
SELECT case_name,pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='owner_collision_legacy';
SELECT is((SELECT outcome->>'status' FROM boundary_outcomes
  WHERE case_name='owner_collision_legacy'),'rejected',
  'R2 domain collision produces a genuine rejected outcome, not NOT_OWNED');
SELECT is((SELECT outcome->>'code' FROM boundary_outcomes
  WHERE case_name='owner_collision_legacy'),'DOMAIN_UNIQUE_CONFLICT',
  'R2 real transaction UUID uniqueness maps physical SQLSTATE 23505');

SELECT is((
  SELECT count(*)
  FROM public.financial_action_groups AS root
  JOIN boundary_inputs AS source
    ON source.case_name='owner_collision_legacy'
  JOIN boundary_outcomes AS result
    ON result.case_name=source.case_name
  WHERE root.user_id=pg_temp.b395_id(7)
    AND root.action_id=pg_temp.b395_id(1003)
    AND root.domain='transactions'
    AND root.kind='create'
    AND root.state='reconciled'
    AND root.server_outcome='rejected'
    AND root.rejection_code='domain_unique_conflict'
    AND root.payload_hash=source.payload_hash
    AND root.payload_json=source.payload_json
    AND root.account_guards_json::jsonb=source.envelope->'accountGuards'
    AND root.outcome_json::jsonb=result.outcome
),1::bigint,
  'R2 owner A persists exact immutable legacy request and rejected root');

SELECT ok((
  SELECT jsonb_array_length(outcome->'canonicalAccounts')=1
    AND outcome->'canonicalAccounts'->0->>'accountId'
      =pg_temp.b395_id(207)::text
    AND outcome->'canonicalAccounts'->0->>'canonicalRevision'='1'
    AND outcome->'canonicalAccounts'->0->>'balanceMinorUnits'='1100'
  FROM boundary_outcomes WHERE case_name='owner_collision_legacy'
),'R2 canonical rejected outcome proves real owner A balance and revision');
SELECT ok((
  SELECT account.balance=11::numeric AND account.financial_revision=1
  FROM public.accounts AS account
  WHERE account.user_id=pg_temp.b395_id(7)
    AND account.id=pg_temp.b395_id(207)
),'R2 failed domain savepoint never commits owner A balance/revision writes');
SELECT is((SELECT count(*) FROM public.transactions
  WHERE user_id=pg_temp.b395_id(7)
    AND id=pg_temp.b395_id(4011)),0::bigint,
  'R2 owner A cannot materialize the colliding foreign transaction');
SELECT is((SELECT count(*) FROM public.account_financial_effects
  WHERE user_id=pg_temp.b395_id(7)
    AND action_id=pg_temp.b395_id(1003)
    AND amount_minor_units=100
    AND currency='EGP'
    AND accepted_account_revision=2
    AND NOT is_effective),1::bigint,
  'R2 deployed legacy rejected action retains exact inactive effect audit');
INSERT INTO boundary_root_proofs(proof_name,root_before)
SELECT 'owner_a',to_jsonb(root)
FROM public.financial_action_groups AS root
WHERE root.user_id=pg_temp.b395_id(7)
  AND root.action_id=pg_temp.b395_id(1003);

INSERT INTO boundary_outcomes(case_name,outcome)
SELECT 'owner_collision_replay',pg_temp.b395_raw_rpc(payload_json,payload_hash)
FROM boundary_inputs WHERE case_name='owner_collision_legacy';
SELECT is((SELECT outcome FROM boundary_outcomes
  WHERE case_name='owner_collision_replay'),(
  SELECT outcome FROM boundary_outcomes
  WHERE case_name='owner_collision_legacy'),
  'R2 exact same-owner replay returns stored rejection, no duplicate write');
SELECT ok((
  SELECT to_jsonb(root) FROM public.financial_action_groups AS root
  WHERE root.user_id=pg_temp.b395_id(7)
    AND root.action_id=pg_temp.b395_id(1003)
)=(SELECT root_before FROM boundary_root_proofs
  WHERE proof_name='owner_a'),
  'R2 replay leaves owner A full immutable rejected root unchanged');
SELECT is((SELECT count(*) FROM public.financial_action_groups
  WHERE action_id=pg_temp.b395_id(1003)),1::bigint,
  'R2 authenticated owner A sees exactly its own action K under RLS');

SELECT pg_temp.b395_actor(pg_temp.b395_id(3));
SELECT ok((
  SELECT to_jsonb(root) FROM public.financial_action_groups AS root
  WHERE root.user_id=pg_temp.b395_id(3)
    AND root.action_id=pg_temp.b395_id(1003)
)=(SELECT root_before FROM boundary_root_proofs
  WHERE proof_name='owner_b'),
  'R2 full owner B accepted root is unchanged by owner A rejection/replay');
SELECT is((SELECT count(*) FROM public.financial_action_groups
  WHERE action_id=pg_temp.b395_id(1003)),1::bigint,
  'R2 authenticated owner B independently sees only its own action K');
SELECT pg_temp.b395_actor(pg_temp.b395_id(6));

-- No deferred violation may be postponed to COMMIT by a purportedly accepted
-- or rejected action. An error returns a SQLSTATE, never a fabricated "ok".
SELECT is(pg_temp.b395_deferred(),'ok',
 'all accepted/rejected Review/Add effects pass real deferred constraints');

SELECT * FROM finish();
ROLLBACK;
