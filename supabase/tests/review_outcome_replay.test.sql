-- #395 T052: independent exception/outcome/replay and deferred-parity tests.
-- Every financial fixture remains inside this transaction; no committed root.
-- The old 103/108/47/43 suites remain byte-for-byte unchanged.
BEGIN;
SELECT plan(33);

CREATE FUNCTION pg_temp.o395_id(p_n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('57c92000-0000-4000-8000-' || lpad(p_n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.o395_snapshot(p_active jsonb,p_default uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'activeAccountIds',p_active,
    'defaultAccount',CASE WHEN p_default IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('accountId',p_default,'isDefault',true) END)
$$;
CREATE FUNCTION pg_temp.o395_add(
  p_owner uuid,p_action uuid,p_created uuid,p_opening text,
  p_snapshot jsonb
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_account jsonb;
  v_guards jsonb;
  v_effects jsonb;
BEGIN
  v_account:=jsonb_build_object(
    'entity','account','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object(
      'id',p_created,'name','Fresh Add','type','CASH','currency','EGP',
      'institutionId',null,'providerDisplayName',null,'isDefault',false,
      'createdAt','2026-09-01T12:00:00.000Z',
      'deleted',false,'openingBalanceMinorUnits',p_opening,
      'targetBalanceMinorUnits',null));
  v_guards:=CASE WHEN p_opening='0' THEN '[]'::jsonb
    ELSE jsonb_build_array(jsonb_build_object(
      'accountId',p_created,'expectedRevision','0')) END;
  v_effects:=CASE WHEN p_opening='0' THEN '[]'::jsonb
    ELSE jsonb_build_array(jsonb_build_object(
      'accountId',p_created,'amountMinorUnits',p_opening,
      'currency','EGP','effectId',p_action)) END;
  RETURN jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1','userId',p_owner,
    'actionId',p_action,'domain','accounts','kind','create_with_default',
    'domainReferenceId',p_created,'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','account.create-default/v1','accountGuards',v_guards,
    'payload',jsonb_build_object(
      'schemaVersion','account.create-default/v1',
      'operationCode','account.create-default',
      'defaultIntent',false,'expectedDefaultSnapshot',p_snapshot,
      'createGuards',jsonb_build_array(jsonb_build_object(
        'entity','account','id',p_created,'expectedAbsent',true)),
      'accountEffects',v_effects,
      'domainRecordRefs',jsonb_build_array(p_created),
      'domainMutation',jsonb_build_object('records',jsonb_build_array(v_account))));
END;
$$;
CREATE FUNCTION pg_temp.o395_review(
  p_owner uuid,p_action uuid,p_account uuid,p_transaction uuid,
  p_category uuid,p_creates_account boolean,p_account_name text,
  p_snapshot jsonb
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_records jsonb; v_refs jsonb; v_creates jsonb;
  v_groups jsonb; v_snapshot jsonb:='{}'::jsonb;
  v_account jsonb; v_tx jsonb;
BEGIN
  v_tx:=jsonb_build_object(
    'entity','transaction','mode','create','expectedUpdatedAt',null,
    'after',jsonb_build_object(
      'id',p_transaction,'accountId',p_account,'amountMinorUnits','100',
      'currency','EGP','type','INCOME','categoryId',p_category,
      'counterparty',null,'note',null,'date','2026-09-01',
      'source','VOICE','smsFingerprint',null,'isDraft',false,
      'linkedAssetId',null,'linkedDebtId',null,'linkedRecurringId',null,
      'createdAt','2026-09-01T12:00:00.000Z','deleted',false));
  IF p_creates_account THEN
    v_account:=jsonb_build_object(
      'entity','account','mode','create','expectedUpdatedAt',null,
      'after',jsonb_build_object(
        'id',p_account,'name',p_account_name,'type','DIGITAL_WALLET',
        'currency','EGP','institutionId',null,'providerDisplayName',null,
        'isDefault',false,'createdAt','2026-09-01T12:00:00.000Z',
        'deleted',false,'openingBalanceMinorUnits','0',
        'targetBalanceMinorUnits',null));
    v_records:=jsonb_build_array(v_account,v_tx);
    v_creates:=jsonb_build_array(
      jsonb_build_object('entity','account','id',p_account,'expectedAbsent',true),
      jsonb_build_object('entity','transaction','id',p_transaction,'expectedAbsent',true));
    v_refs:=jsonb_build_array(p_account,p_transaction);
    v_groups:=jsonb_build_array(jsonb_build_object(
      'groupId',p_action,'revision','1','accountId',p_account));
    v_snapshot:=jsonb_build_object('creationDefaultSnapshot',p_snapshot);
  ELSE
    v_records:=jsonb_build_array(v_tx);
    v_creates:=jsonb_build_array(jsonb_build_object(
      'entity','transaction','id',p_transaction,'expectedAbsent',true));
    v_refs:=jsonb_build_array(p_transaction);
    v_groups:='[]'::jsonb;
  END IF;
  RETURN jsonb_build_object(
    'envelopeVersion','monyvi.financial-action/v1',
    'userId',p_owner,'actionId',p_action,
    'domain','transactions','kind','review_batch_save',
    'domainReferenceId',p_transaction,
    'occurredAt','2026-09-01T12:00:00.000Z',
    'payloadVersion','review.batch-save/v1',
    'accountGuards',jsonb_build_array(jsonb_build_object(
      'accountId',p_account,'expectedRevision','0')),
    'payload',jsonb_build_object(
      'schemaVersion','review.batch-save/v1',
      'operationCode','review.batch-save',
      'source','VOICE','sessionId',pg_temp.o395_id(9941),
      'frozenIntentDigest',encode(extensions.digest(
        convert_to('t052-outcome:'||p_action::text,'UTF8'),'sha256'),'hex'),
      'selectedSourceRefs',jsonb_build_array(jsonb_build_object(
        'rowId',p_action,'recordId',p_transaction,'sourceFingerprint',null)),
      'confirmedGroupRefs',v_groups,'createGuards',v_creates,
      'accountEffects',jsonb_build_array(jsonb_build_object(
        'accountId',p_account,'amountMinorUnits','100','currency','EGP',
        'effectId',p_action)),
      'domainRecordRefs',v_refs,
      'domainMutation',jsonb_build_object('records',v_records),
      'localSmsBookkeeping','[]'::jsonb) || v_snapshot);
END;
$$;
CREATE FUNCTION pg_temp.o395_actor(p_owner uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',p_owner::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',p_owner,'role','authenticated')::text,true);
END;
$$;
CREATE FUNCTION pg_temp.o395_rpc(p_payload_json text,p_payload_hash text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT public.apply_account_financial_action_v1(p_payload_json,p_payload_hash)
  INTO STRICT v_result;
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  -- No exception, lock timeout, auth failure, or stale status is ever turned
  -- into rejected/accepted by the harness. The SQLSTATE is asserted verbatim.
  RETURN jsonb_build_object('status','sqlstate:'||SQLSTATE);
END;
$$;
CREATE FUNCTION pg_temp.o395_deferred()
RETURNS text LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN 'sqlstate:'||SQLSTATE;
END;
$$;

INSERT INTO auth.users (id,aud,role,email,encrypted_password,
 raw_app_meta_data,raw_user_meta_data)
SELECT pg_temp.o395_id(n),'authenticated','authenticated',
 'sql395-outcome-'||n||'@monyvi.test','unused','{}','{}'
FROM generate_series(41,45) AS g(n);
INSERT INTO public.accounts
  (id,user_id,name,type,balance,currency,financial_revision,is_default,deleted)
VALUES
  (pg_temp.o395_id(441),pg_temp.o395_id(41),'Collision Wallet',
   'DIGITAL_WALLET',10,'EGP',0,true,false),
  (pg_temp.o395_id(442),pg_temp.o395_id(42),'Existing Bank',
   'BANK',10,'EGP',0,true,false),
  (pg_temp.o395_id(443),pg_temp.o395_id(43),'Prior Default',
   'CASH',10,'EGP',0,true,false),
  (pg_temp.o395_id(543),pg_temp.o395_id(43),'Other Active',
   'BANK',10,'EGP',0,false,false),
  (pg_temp.o395_id(445),pg_temp.o395_id(45),'Good Bank',
   'BANK',10,'EGP',0,true,false);
INSERT INTO public.categories(id,user_id,system_name,display_name,icon,level)
SELECT pg_temp.o395_id(800+n),pg_temp.o395_id(n),
 'outcome-'||n,'Outcome '||n,'wallet',1
FROM (VALUES (41),(42),(45)) AS g(n);
-- Genuine occupied financial CREATE ID, not a fake uniqueness error.
INSERT INTO public.transactions(id,user_id,account_id,amount,currency,type,
 category_id,counterparty,note,date,source,is_draft,
 linked_asset_id,linked_debt_id,linked_recurring_id,sms_fingerprint,deleted)
VALUES (pg_temp.o395_id(742),pg_temp.o395_id(42),pg_temp.o395_id(442),
 1,'EGP','INCOME',pg_temp.o395_id(842),
 null,null,'2026-09-01','VOICE',false,null,null,null,null,false);

CREATE TEMP TABLE outcome_inputs(
  case_name text PRIMARY KEY,owner_n integer NOT NULL,envelope jsonb NOT NULL,
  payload_json text,payload_hash text
) ON COMMIT DROP;
CREATE TEMP TABLE outcome_results(
  case_name text PRIMARY KEY,reply jsonb NOT NULL
) ON COMMIT DROP;
INSERT INTO outcome_inputs(case_name,owner_n,envelope) VALUES
('review_account_uniqueness',41,pg_temp.o395_review(
 pg_temp.o395_id(41),pg_temp.o395_id(1041),pg_temp.o395_id(341),
 pg_temp.o395_id(741),pg_temp.o395_id(841),true,'Collision Wallet',
 pg_temp.o395_snapshot(jsonb_build_array(pg_temp.o395_id(441)),pg_temp.o395_id(441)))),
('review_record_uniqueness',42,pg_temp.o395_review(
 pg_temp.o395_id(42),pg_temp.o395_id(1042),pg_temp.o395_id(442),
 pg_temp.o395_id(742),pg_temp.o395_id(842),false,null,
 pg_temp.o395_snapshot('[]'::jsonb,null))),
('add_stale_nonzero',43,pg_temp.o395_add(
 pg_temp.o395_id(43),pg_temp.o395_id(1043),pg_temp.o395_id(343),
 '1001',pg_temp.o395_snapshot(
   jsonb_build_array(pg_temp.o395_id(443)),pg_temp.o395_id(443)))),
('add_good_nonzero',44,pg_temp.o395_add(
 pg_temp.o395_id(44),pg_temp.o395_id(1044),pg_temp.o395_id(344),
 '1001',pg_temp.o395_snapshot('[]'::jsonb,null))),
('review_good',45,pg_temp.o395_review(
 pg_temp.o395_id(45),pg_temp.o395_id(1045),pg_temp.o395_id(445),
 pg_temp.o395_id(745),pg_temp.o395_id(845),false,null,
 pg_temp.o395_snapshot('[]'::jsonb,null)));

-- Positive fresh-owner Add must mark the first created account default ON;
-- this is a one-field correction to the otherwise later-OFF helper, and it
-- remains explicit canonical Add intent (not an inferred SQL convenience).
UPDATE outcome_inputs
SET envelope=jsonb_set(
  jsonb_set(
    jsonb_set(envelope,'{payload,defaultIntent}','true'::jsonb),
    '{payload,domainMutation,records,0,after,isDefault}','true'::jsonb),
  '{actionId}',to_jsonb(pg_temp.o395_id(1044)))
WHERE case_name='add_good_nonzero';

-- Only fixture setup calls private encoder/hash; signed authenticated actors
-- invoke exactly public.apply_account_financial_action_v1(text,text).
UPDATE outcome_inputs
SET payload_json=private.financial_action_encode_jsonb_v1(envelope);
UPDATE outcome_inputs
SET payload_hash=encode(
  extensions.digest(convert_to(payload_json,'UTF8'),'sha256'),'hex');

GRANT SELECT ON outcome_inputs TO authenticated;
GRANT SELECT,INSERT ON outcome_results TO authenticated;
SET LOCAL ROLE authenticated;

-- F1/F2: an account physically collides AFTER Review's strict validator.
-- The caught RPC must preserve canonical rejected evidence and one replay root;
-- it may not surface missing-record P0002 or fabricate a compensated effect.
SELECT pg_temp.o395_actor(pg_temp.o395_id(41));
INSERT INTO outcome_results SELECT case_name,
 pg_temp.o395_rpc(payload_json,payload_hash)
FROM outcome_inputs WHERE case_name='review_account_uniqueness';
SELECT is((SELECT reply->>'status' FROM outcome_results
 WHERE case_name='review_account_uniqueness'),'rejected',
 'F1/F2 new-account uniqueness conflict yields canonical rejected, not P0002');
SELECT is((SELECT count(*) FROM public.financial_action_groups
 WHERE action_id=pg_temp.o395_id(1041)),1::bigint,
 'F1/F2 exactly one durable rejection root exists on uniqueness conflict');
SELECT is((SELECT server_outcome FROM public.financial_action_groups
 WHERE action_id=pg_temp.o395_id(1041)),'rejected',
 'F1/F2 root has canonical rejected server outcome');
SELECT is((SELECT count(*) FROM public.accounts
 WHERE id=pg_temp.o395_id(341)),0::bigint,
 'F2 rejected new account has no remaining physical postimage');
SELECT is((SELECT count(*) FROM public.account_financial_effects
 WHERE action_id=pg_temp.o395_id(1041)),0::bigint,
 'F2 failed Review never inserts compensated or effective physical effects');
SELECT is((SELECT reply->'canonicalAbsentAccountIds' @>
  jsonb_build_array(pg_temp.o395_id(341)) FROM outcome_results
 WHERE case_name='review_account_uniqueness'),true,
 'F2 rejected root names the truly absent created account');
SELECT is((SELECT pg_temp.o395_rpc(payload_json,payload_hash)->>'status'
 FROM outcome_inputs WHERE case_name='review_account_uniqueness'),
 'rejected','F1 same action/hash replay returns its prior rejected result');
SELECT is((SELECT count(*) FROM public.financial_action_groups
 WHERE action_id=pg_temp.o395_id(1041)),1::bigint,
 'F1 replay does not duplicate the rejected immutable root');

-- F2: collision with an already-owned transaction ID on an existing account;
-- the old handler inserted non-effective effects although Review rejects all
-- physical effects for rejected/stale roots.
SELECT pg_temp.o395_actor(pg_temp.o395_id(42));
INSERT INTO outcome_results SELECT case_name,
 pg_temp.o395_rpc(payload_json,payload_hash)
FROM outcome_inputs WHERE case_name='review_record_uniqueness';
SELECT is((SELECT reply->>'status' FROM outcome_results
 WHERE case_name='review_record_uniqueness'),'rejected',
 'F2 duplicate transaction CREATE returns rejected, not a SQLSTATE');
SELECT is((SELECT count(*) FROM public.account_financial_effects
 WHERE action_id=pg_temp.o395_id(1042)),0::bigint,
 'F2 failed existing-account Review posts NO compensated physical effects');
SELECT is((SELECT financial_revision FROM public.accounts
 WHERE id=pg_temp.o395_id(442)),0::bigint,
 'F2 rejected Review does not post an existing account revision');
SELECT is((SELECT count(*) FROM public.transactions
 WHERE id=pg_temp.o395_id(742)),1::bigint,
 'F2 original occupied transaction survives without duplicate overwrite');
SELECT is((SELECT count(*) FROM public.financial_action_groups
 WHERE action_id=pg_temp.o395_id(1042)),1::bigint,
 'F2 transaction collision has one canonical rejection root');

-- F2: an Add with a valid nonzero opening guard but stale logical default
-- snapshot must remain effect-free AND pass the existing deferred parity check.
SELECT pg_temp.o395_actor(pg_temp.o395_id(43));
INSERT INTO outcome_results SELECT case_name,
 pg_temp.o395_rpc(payload_json,payload_hash)
FROM outcome_inputs WHERE case_name='add_stale_nonzero';
SELECT is((SELECT reply->>'status' FROM outcome_results
 WHERE case_name='add_stale_nonzero'),'stale',
 'F2 nonzero Add detects changed active-account set as stale');
SELECT is((SELECT count(*) FROM public.financial_action_groups
 WHERE action_id=pg_temp.o395_id(1043) AND server_outcome='stale'),
 1::bigint,'F2 stale nonzero Add retains its canonical root once');
SELECT is((SELECT count(*) FROM public.account_financial_effects
 WHERE action_id=pg_temp.o395_id(1043)),0::bigint,
 'F2 nonzero stale Add writes NO physical effect');
SELECT is((SELECT count(*) FROM public.accounts
 WHERE id=pg_temp.o395_id(343)),0::bigint,
 'F2 stale Add never inserts the new account');
SELECT is((SELECT financial_revision FROM public.accounts
 WHERE id=pg_temp.o395_id(443)),0::bigint,
 'F2 stale Add preserves prior account revision');
SELECT is((SELECT id FROM public.accounts
 WHERE user_id=pg_temp.o395_id(43) AND NOT deleted AND is_default),
 pg_temp.o395_id(443),'F2 stale Add retains the original default');
SELECT is((SELECT pg_temp.o395_rpc(payload_json,payload_hash)->>'status'
 FROM outcome_inputs WHERE case_name='add_stale_nonzero'),
 'stale','F1/F2 same stale Add action replay returns stored stale result');
SELECT is((SELECT count(*) FROM public.financial_action_groups
 WHERE action_id=pg_temp.o395_id(1043)),1::bigint,
 'F1/F2 replay does not create a second stale Add root');

-- Real public-RPC positive controls (not a mocked status) independently
-- establish accepted, idempotent replay, physical financial effects and
-- root-before-effect FK order for unaffected paths.
SELECT pg_temp.o395_actor(pg_temp.o395_id(44));
INSERT INTO outcome_results SELECT case_name,
 pg_temp.o395_rpc(payload_json,payload_hash)
FROM outcome_inputs WHERE case_name='add_good_nonzero';
SELECT is((SELECT reply->>'status' FROM outcome_results
 WHERE case_name='add_good_nonzero'),'accepted',
 'Control: correct first-account Add opening 1001 is accepted');
SELECT is((SELECT balance FROM public.accounts
 WHERE id=pg_temp.o395_id(344)),10.01::numeric,
 'Control: Add balance has exact 10.01 with no adjustment transaction');
SELECT is((SELECT financial_revision FROM public.accounts
 WHERE id=pg_temp.o395_id(344)),1::bigint,
 'Control: Add one new account revision');
SELECT is((SELECT count(*) FROM public.financial_action_groups
 WHERE action_id=pg_temp.o395_id(1044) AND server_outcome='accepted'),
 1::bigint,'Control: accepted Add root precedes the effect FK');
SELECT is((SELECT count(*) FROM public.account_financial_effects
 WHERE action_id=pg_temp.o395_id(1044) AND amount_minor_units=1001
 AND is_effective),1::bigint,
 'Control: exactly one committed-in-transaction nonzero opening effect');
SELECT is((SELECT pg_temp.o395_rpc(payload_json,payload_hash)->>'status'
 FROM outcome_inputs WHERE case_name='add_good_nonzero'),
 'idempotent','Control: accepted Add replay idempotent, not rewritten');

SELECT pg_temp.o395_actor(pg_temp.o395_id(45));
INSERT INTO outcome_results SELECT case_name,
 pg_temp.o395_rpc(payload_json,payload_hash)
FROM outcome_inputs WHERE case_name='review_good';
SELECT is((SELECT reply->>'status' FROM outcome_results
 WHERE case_name='review_good'),'accepted',
 'Control: valid existing-account Review accepted');
SELECT is((SELECT financial_revision FROM public.accounts
 WHERE id=pg_temp.o395_id(445)),1::bigint,
 'Control: Review financial revision advanced exactly once');
SELECT is((SELECT count(*) FROM public.account_financial_effects
 WHERE action_id=pg_temp.o395_id(1045) AND amount_minor_units=100
 AND is_effective),1::bigint,
 'Control: Review effect carries signed canonical 100 minor units');
SELECT is((SELECT pg_temp.o395_rpc(payload_json,payload_hash)->>'status'
 FROM outcome_inputs WHERE case_name='review_good'),
 'idempotent','Control: accepted Review replays without reposting');
SELECT is((SELECT count(*) FROM public.account_financial_effects
 WHERE action_id=pg_temp.o395_id(1045)),1::bigint,
 'Control: replay has exactly one physical Review effect');

-- Must force the true deferred action-root/effect parity BEFORE rollback.
-- No false "Green" merely because the outer test transaction never commits.
SELECT is(pg_temp.o395_deferred(),'ok',
 'All accepted/rejected/stale roots satisfy installed deferred constraints NOW');
SELECT * FROM finish();
ROLLBACK;
