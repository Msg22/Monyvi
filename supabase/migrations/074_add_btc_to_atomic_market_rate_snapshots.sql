-- Migration 074 promotes BTC/USD into the exact atomic current snapshot.
-- BTC remains hidden from the Metals fiat list; this observation exists so global
-- account and net-worth totals never become unavailable for valid BTC accounts.

alter table public.market_rate_observations
  drop constraint if exists market_rate_observations_check1;

alter table public.market_rate_observations
  add constraint market_rate_observations_instrument_contract_check
  check (
    (
      instrument_code in ('metal:GOLD', 'metal:SILVER')
      and unit = 'usd_per_pure_gram'
      and orientation = 'quote_per_base'
    )
    or
    (
      instrument_code in (
        'currency:EGP', 'currency:SAR', 'currency:AED', 'currency:KWD',
        'currency:QAR', 'currency:BHD', 'currency:OMR', 'currency:JOD',
        'currency:IQD', 'currency:LYD', 'currency:TND', 'currency:MAD',
        'currency:DZD', 'currency:USD', 'currency:EUR', 'currency:GBP',
        'currency:JPY', 'currency:CHF', 'currency:CNY', 'currency:INR',
        'currency:KRW', 'currency:KPW', 'currency:SGD', 'currency:HKD',
        'currency:MYR', 'currency:AUD', 'currency:NZD', 'currency:CAD',
        'currency:SEK', 'currency:NOK', 'currency:DKK', 'currency:ISK',
        'currency:TRY', 'currency:RUB', 'currency:ZAR', 'currency:BTC'
      )
      and (
        (unit = 'usd_per_currency_unit' and orientation = 'quote_per_base')
        or
        (unit = 'currency_units_per_usd' and orientation = 'base_per_quote')
      )
    )
  ) not valid;

alter table public.market_rate_observations
  validate constraint market_rate_observations_instrument_contract_check;

create or replace function private.market_rate_snapshot_required_instruments_v1()
 returns text[]
 language sql
 immutable
 security definer
 set search_path = ''
 as $$
   select array[
     'metal:GOLD', 'metal:SILVER',
     'currency:EGP', 'currency:SAR', 'currency:AED', 'currency:KWD',
     'currency:QAR', 'currency:BHD', 'currency:OMR', 'currency:JOD',
     'currency:IQD', 'currency:LYD', 'currency:TND', 'currency:MAD',
     'currency:DZD', 'currency:USD', 'currency:EUR', 'currency:GBP',
     'currency:JPY', 'currency:CHF', 'currency:CNY', 'currency:INR',
     'currency:KRW', 'currency:KPW', 'currency:SGD', 'currency:HKD',
     'currency:MYR', 'currency:AUD', 'currency:NZD', 'currency:CAD',
     'currency:SEK', 'currency:NOK', 'currency:DKK', 'currency:ISK',
     'currency:TRY', 'currency:RUB', 'currency:ZAR', 'currency:BTC'
   ]::text[];
 $$;

create or replace function private.market_rate_snapshot_is_complete_v1(p_snapshot_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path = ''
 as $$
   select coalesce(
     count(*) = 38
       and count(distinct observation.instrument_code) = 38
       and array_agg(observation.instrument_code order by observation.instrument_code)
         = (
           select array_agg(code order by code)
           from unnest(private.market_rate_snapshot_required_instruments_v1()) as code
         )
       and bool_and(
         observation.source is not null
         and length(btrim(observation.source)) > 0
         and observation.quality = 'valid'
         and observation.orientation = 'quote_per_base'
         and observation.created_at = root.created_at
         and observation.unit = case
           when observation.instrument_code like 'metal:%' then 'usd_per_pure_gram'
           else 'usd_per_currency_unit'
         end
         and observation.provider_observed_at is not distinct from case
           when observation.instrument_code like 'metal:%' then root.timestamp_metal
           else root.timestamp_currency
         end
         and observation.value_decimal::text = case observation.instrument_code
           when 'metal:GOLD' then root.gold_usd_per_gram::text
           when 'metal:SILVER' then root.silver_usd_per_gram::text
           when 'currency:USD' then '1'
           else (private.market_rate_snapshot_root_payload_v1(root.id)
             #>> array['fiatUsdPerUnit', split_part(observation.instrument_code, ':', 2)])
         end
       ),
     false
   )
   from public.market_rates as root
   join public.market_rate_observations as observation
     on observation.batch_id = root.id
   where root.id = p_snapshot_id
   group by root.id;
 $$;

create or replace function public.persist_market_rate_snapshot_v1(
   p_snapshot_id uuid,
   p_captured_at timestamptz,
   p_root jsonb,
   p_observations jsonb
 )
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
 as $$
 declare
   v_required text[] := private.market_rate_snapshot_required_instruments_v1();
   v_fiat_keys text[] := array[
     'AED','AUD','BHD','BTC','CAD','CHF','CNY','DKK','DZD','EGP','EUR','GBP',
     'HKD','INR','IQD','ISK','JOD','JPY','KPW','KRW','KWD','LYD','MAD','MYR',
     'NOK','NZD','OMR','QAR','RUB','SAR','SEK','SGD','TND','TRY','ZAR'
   ]::text[];
   v_observation jsonb;
   v_instrument text;
   v_value text;
   v_expected_value text;
   v_source text;
   v_provider_observed_at timestamptz;
   v_metal_time timestamptz;
   v_currency_time timestamptz;
   v_canonical_observations jsonb := '[]'::jsonb;
   v_existing_root jsonb;
   v_expected_root jsonb;
 begin
   if p_snapshot_id is null
     or p_captured_at is null
     or not isfinite(p_captured_at)
     or jsonb_typeof(p_root) is distinct from 'object'
     or jsonb_typeof(p_observations) is distinct from 'array'
   then
     raise exception using errcode = '22023', message = 'snapshot_invalid_payload';
   end if;
 
   if (
     select array_agg(key order by key) from jsonb_object_keys(p_root) as key
   ) is distinct from array[
     'fiatUsdPerUnit','goldUsdPerGram','palladiumUsdPerGram','platinumUsdPerGram',
     'providerCurrencyObservedAt','providerMetalObservedAt','silverUsdPerGram'
   ]::text[]
     or jsonb_typeof(p_root -> 'fiatUsdPerUnit') is distinct from 'object'
     or (
       select array_agg(key order by key)
       from jsonb_object_keys(p_root -> 'fiatUsdPerUnit') as key
     ) is distinct from v_fiat_keys
     or jsonb_typeof(p_root -> 'goldUsdPerGram') is distinct from 'string'
     or jsonb_typeof(p_root -> 'silverUsdPerGram') is distinct from 'string'
     or jsonb_typeof(p_root -> 'platinumUsdPerGram') is distinct from 'string'
     or jsonb_typeof(p_root -> 'palladiumUsdPerGram') is distinct from 'string'
   then
     raise exception using errcode = '22023', message = 'snapshot_invalid_payload';
   end if;
 
   perform private.market_rate_snapshot_decimal_v1(p_root ->> 'goldUsdPerGram');
   perform private.market_rate_snapshot_decimal_v1(p_root ->> 'silverUsdPerGram');
   perform private.market_rate_snapshot_decimal_v1(p_root ->> 'platinumUsdPerGram');
   perform private.market_rate_snapshot_decimal_v1(p_root ->> 'palladiumUsdPerGram');
   foreach v_instrument in array v_fiat_keys loop
     if jsonb_typeof(p_root -> 'fiatUsdPerUnit' -> v_instrument) is distinct from 'string' then
       raise exception using errcode = '22023', message = 'snapshot_invalid_payload';
     end if;
     perform private.market_rate_snapshot_decimal_v1(
       p_root -> 'fiatUsdPerUnit' ->> v_instrument
     );
   end loop;
 
   v_metal_time := private.market_rate_snapshot_timestamp_v1(
     p_root -> 'providerMetalObservedAt', p_captured_at
   );
   v_currency_time := private.market_rate_snapshot_timestamp_v1(
     p_root -> 'providerCurrencyObservedAt', p_captured_at
   );
 
   if jsonb_array_length(p_observations) <> 38
     or (
       select count(distinct item ->> 'instrumentCode')
       from jsonb_array_elements(p_observations) as item
     ) <> 38
     or (
       select array_agg(item ->> 'instrumentCode' order by item ->> 'instrumentCode')
       from jsonb_array_elements(p_observations) as item
     ) is distinct from (
       select array_agg(code order by code) from unnest(v_required) as code
     )
   then
     raise exception using errcode = '22023', message = 'snapshot_incomplete';
   end if;
 
   for v_observation in select value from jsonb_array_elements(p_observations) loop
     if jsonb_typeof(v_observation) is distinct from 'object'
       or (
         select array_agg(key order by key) from jsonb_object_keys(v_observation) as key
       ) is distinct from array[
         'instrumentCode','orientation','providerObservedAt','quality','source','unit','valueDecimal'
       ]::text[]
       or jsonb_typeof(v_observation -> 'instrumentCode') is distinct from 'string'
       or jsonb_typeof(v_observation -> 'valueDecimal') is distinct from 'string'
       or jsonb_typeof(v_observation -> 'unit') is distinct from 'string'
       or jsonb_typeof(v_observation -> 'orientation') is distinct from 'string'
       or jsonb_typeof(v_observation -> 'quality') is distinct from 'string'
     then
       raise exception using errcode = '22023', message = 'snapshot_invalid_observation';
     end if;
 
     v_instrument := v_observation ->> 'instrumentCode';
     v_value := v_observation ->> 'valueDecimal';
     v_source := btrim(v_observation ->> 'source');
     if jsonb_typeof(v_observation -> 'source') is distinct from 'string'
       or length(v_source) = 0
     then
       raise exception using errcode = '22023', message = 'snapshot_invalid_source';
     end if;
 
     if v_observation ->> 'quality' <> 'valid'
       or v_observation ->> 'orientation' <> 'quote_per_base'
       or v_observation ->> 'unit' <> (case
         when v_instrument like 'metal:%' then 'usd_per_pure_gram'
         else 'usd_per_currency_unit'
       end)
     then
       raise exception using errcode = '22023', message = 'snapshot_invalid_observation';
     end if;
 
     perform private.market_rate_snapshot_decimal_v1(v_value);
     v_expected_value := case v_instrument
       when 'metal:GOLD' then p_root ->> 'goldUsdPerGram'
       when 'metal:SILVER' then p_root ->> 'silverUsdPerGram'
       when 'currency:USD' then '1'
       else p_root #>> array['fiatUsdPerUnit', split_part(v_instrument, ':', 2)]
     end;
     if v_value is distinct from v_expected_value then
       raise exception using errcode = '22023', message = 'snapshot_value_mismatch';
     end if;
 
     v_provider_observed_at := private.market_rate_snapshot_timestamp_v1(
       v_observation -> 'providerObservedAt', p_captured_at
     );
     if v_provider_observed_at is distinct from (case
       when v_instrument like 'metal:%' then v_metal_time
       else v_currency_time
     end) then
       raise exception using errcode = '22023', message = 'snapshot_invalid_observation';
     end if;
 
     v_canonical_observations := v_canonical_observations || jsonb_build_array(
       jsonb_build_object(
         'instrumentCode', v_instrument,
         'valueDecimal', v_value,
         'unit', v_observation ->> 'unit',
         'orientation', 'quote_per_base',
         'providerObservedAt', v_provider_observed_at,
         'source', v_source,
         'quality', 'valid'
       )
     );
   end loop;
 
   select coalesce(jsonb_agg(item order by item ->> 'instrumentCode'), '[]'::jsonb)
   into v_canonical_observations
   from jsonb_array_elements(v_canonical_observations) as item;
 
   v_expected_root := jsonb_build_object(
     'goldUsdPerGram', p_root ->> 'goldUsdPerGram',
     'silverUsdPerGram', p_root ->> 'silverUsdPerGram',
     'platinumUsdPerGram', p_root ->> 'platinumUsdPerGram',
     'palladiumUsdPerGram', p_root ->> 'palladiumUsdPerGram',
     'fiatUsdPerUnit', p_root -> 'fiatUsdPerUnit',
     'providerMetalObservedAt', v_metal_time,
     'providerCurrencyObservedAt', v_currency_time
   );
 
   perform 1 from public.market_rates where id = p_snapshot_id for update;
   if found then
     v_existing_root := private.market_rate_snapshot_root_payload_v1(p_snapshot_id);
     if v_existing_root is distinct from v_expected_root
       or (select created_at from public.market_rates where id = p_snapshot_id)
         is distinct from p_captured_at
       or private.market_rate_snapshot_observation_payload_v1(p_snapshot_id, false)
         is distinct from v_canonical_observations
     then
       raise exception using errcode = '23505', message = 'snapshot_conflict';
     end if;
     return jsonb_build_object('snapshotId', p_snapshot_id, 'status', 'replayed');
   end if;
 
   insert into public.market_rates (
     id, created_at, updated_at,
     gold_usd_per_gram, silver_usd_per_gram,
     platinum_usd_per_gram, palladium_usd_per_gram,
     egp_usd, sar_usd, aed_usd, kwd_usd, qar_usd, bhd_usd, omr_usd,
     jod_usd, iqd_usd, lyd_usd, tnd_usd, mad_usd, dzd_usd,
     eur_usd, gbp_usd, jpy_usd, chf_usd, cny_usd, inr_usd, krw_usd,
     kpw_usd, sgd_usd, hkd_usd, myr_usd, aud_usd, nzd_usd, cad_usd,
     sek_usd, nok_usd, dkk_usd, isk_usd, try_usd, rub_usd, zar_usd,
     btc_usd, timestamp_metal, timestamp_currency
   ) values (
     p_snapshot_id, p_captured_at, p_captured_at,
     private.market_rate_snapshot_decimal_v1(p_root ->> 'goldUsdPerGram'),
     private.market_rate_snapshot_decimal_v1(p_root ->> 'silverUsdPerGram'),
     private.market_rate_snapshot_decimal_v1(p_root ->> 'platinumUsdPerGram'),
     private.market_rate_snapshot_decimal_v1(p_root ->> 'palladiumUsdPerGram'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,EGP}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,SAR}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,AED}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,KWD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,QAR}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,BHD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,OMR}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,JOD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,IQD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,LYD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,TND}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,MAD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,DZD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,EUR}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,GBP}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,JPY}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,CHF}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,CNY}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,INR}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,KRW}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,KPW}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,SGD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,HKD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,MYR}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,AUD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,NZD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,CAD}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,SEK}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,NOK}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,DKK}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,ISK}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,TRY}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,RUB}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,ZAR}'),
     private.market_rate_snapshot_decimal_v1(p_root #>> '{fiatUsdPerUnit,BTC}'),
     v_metal_time, v_currency_time
   );
 
   insert into public.market_rate_observations (
     id, batch_id, instrument_code, value_decimal, unit, orientation,
     provider_observed_at, source, quality, created_at
   )
   select
     extensions.gen_random_uuid(),
     p_snapshot_id,
     item ->> 'instrumentCode',
     private.market_rate_snapshot_decimal_v1(item ->> 'valueDecimal'),
     item ->> 'unit',
     item ->> 'orientation',
     private.market_rate_snapshot_timestamp_v1(item -> 'providerObservedAt', p_captured_at),
     item ->> 'source',
     item ->> 'quality',
     p_captured_at
   from jsonb_array_elements(v_canonical_observations) as item;
 
   return jsonb_build_object('snapshotId', p_snapshot_id, 'status', 'created');
 exception when unique_violation then
   raise exception using errcode = '23505', message = 'snapshot_conflict';
 end;
 $$;

comment on function public.persist_market_rate_snapshot_v1(uuid, timestamptz, jsonb, jsonb)
  is 'Persists one exact market-rate root plus exactly 38 bound observations atomically.';
