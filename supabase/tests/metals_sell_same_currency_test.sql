begin;
select plan(8);
create or replace function pg_temp.same_currency_sell(p_sale_currency text)
returns jsonb language sql as $$
 select jsonb_build_object(
  'holdingId','018f0c7a-1234-7abc-8def-000000000002',
  'expectedHoldingRevision','0','predecessorEventId',null,'reversesEventId',null,
  'metalType','GOLD','purchaseCurrency','EGP','saleCurrency',p_sale_currency,
  'saleDate','2026-10-10','grossProceedsMinorUnits','12000','feeMinorUnits','500',
  'netProceedsMinorUnits','11500','notes',null,'rateSnapshots','[]'::jsonb
 )
$$;
create or replace function pg_temp.same_currency_sell_snapshots(p_proceeds_currency text)
returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object(
  'capturedAt','2026-10-10T12:00:00.000Z','capturedFreshness','unknown',
  'instrumentCode',case when role = 'terminal_metal' then 'metal:GOLD'
    when role = 'terminal_purchase_currency' then 'currency:EGP'
    else 'currency:' || p_proceeds_currency end,
  'kind',case when role = 'terminal_metal' then 'metal' else 'currency' end,
  'orientation','quote_per_base','providerObservedAt',null,'quality','valid',
  'referenceId',reference_id,'role',role,'source',null,
  'unit',case when role = 'terminal_metal' then 'usd_per_pure_gram' else 'usd_per_currency_unit' end,
  'valueDecimal',case when role = 'terminal_metal' then '100' else '1' end
 )) from (values
  ('terminal_metal','018f0c7a-1234-7abc-8def-000000000011'),
  ('terminal_purchase_currency','018f0c7a-1234-7abc-8def-000000000012'),
  ('terminal_proceeds_currency','018f0c7a-1234-7abc-8def-000000000013')
 ) as snapshot(role,reference_id)
$$;
select lives_ok($$select private.financial_action_validate_metals_sell_payload_v2(pg_temp.same_currency_sell('EGP'))$$,
 'same-currency whole-holding sale remains valid without rates');
select throws_ok($$select private.financial_action_validate_metals_sell_payload_v2(pg_temp.same_currency_sell('USD'))$$,
 '22023','financial_action_invalid_payload','cross-currency proceeds rejected at server validator');
select throws_ok($$select private.financial_action_validate_metals_sell_payload_v2(jsonb_set(pg_temp.same_currency_sell('EGP'),'{feeMinorUnits}','"12001"'))$$,
 '22023','financial_action_invalid_payload','fee cannot exceed gross');
select throws_ok($$select private.financial_action_validate_metals_sell_payload_v2(jsonb_set(pg_temp.same_currency_sell('EGP'),'{netProceedsMinorUnits}','"1"'))$$,
 '22023','financial_action_invalid_payload','net remains exact gross minus fee');
select throws_ok($$select private.financial_action_validate_metals_sell_payload_v2(pg_temp.same_currency_sell('EGP') || '{"accountId":"018f0c7a-1234-7abc-8def-000000000099"}'::jsonb)$$,
 '22023','financial_action_invalid_payload','account-effect capability remains closed');
select lives_ok($$select private.financial_action_validate_metals_sell_payload_v2(
 jsonb_set(pg_temp.same_currency_sell('EGP'),'{rateSnapshots}',pg_temp.same_currency_sell_snapshots('EGP')))$$,
 'complete same-currency unknown-age snapshots remain valid immutable evidence');
select throws_ok($$select private.financial_action_validate_metals_sell_payload_v2(
 jsonb_set(pg_temp.same_currency_sell('USD'),'{rateSnapshots}',pg_temp.same_currency_sell_snapshots('USD')))$$,
 '22023','financial_action_invalid_payload','cross-currency also rejected with complete snapshots');
select throws_ok($$select private.financial_action_validate_metals_sell_payload_v2(
 jsonb_set(pg_temp.same_currency_sell('EGP'),'{rateSnapshots}',pg_temp.same_currency_sell_snapshots('USD')))$$,
 '22023','financial_action_invalid_payload','existing proceeds-role instrument binding is preserved');
select * from finish();
rollback;
