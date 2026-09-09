-- Bind exact current market-rate evidence to one immutable root and expose
-- transactional persistence plus fail-closed snapshot paging.

-- Legacy market-rate columns used numeric(15,4), which silently rounded exact
-- provider values. Preserve existing data while removing only that scale cap.
alter table public.market_rates
  alter column gold_usd_per_gram type numeric using gold_usd_per_gram::numeric,
  alter column silver_usd_per_gram type numeric using silver_usd_per_gram::numeric,
  alter column platinum_usd_per_gram type numeric using platinum_usd_per_gram::numeric,
  alter column palladium_usd_per_gram type numeric using palladium_usd_per_gram::numeric,
  alter column egp_usd type numeric using egp_usd::numeric,
  alter column sar_usd type numeric using sar_usd::numeric,
  alter column aed_usd type numeric using aed_usd::numeric,
  alter column kwd_usd type numeric using kwd_usd::numeric,
  alter column qar_usd type numeric using qar_usd::numeric,
  alter column bhd_usd type numeric using bhd_usd::numeric,
  alter column omr_usd type numeric using omr_usd::numeric,
  alter column jod_usd type numeric using jod_usd::numeric,
  alter column iqd_usd type numeric using iqd_usd::numeric,
  alter column lyd_usd type numeric using lyd_usd::numeric,
  alter column tnd_usd type numeric using tnd_usd::numeric,
  alter column mad_usd type numeric using mad_usd::numeric,
  alter column dzd_usd type numeric using dzd_usd::numeric,
  alter column eur_usd type numeric using eur_usd::numeric,
  alter column gbp_usd type numeric using gbp_usd::numeric,
  alter column jpy_usd type numeric using jpy_usd::numeric,
  alter column chf_usd type numeric using chf_usd::numeric,
  alter column cny_usd type numeric using cny_usd::numeric,
  alter column inr_usd type numeric using inr_usd::numeric,
  alter column krw_usd type numeric using krw_usd::numeric,
  alter column kpw_usd type numeric using kpw_usd::numeric,
  alter column sgd_usd type numeric using sgd_usd::numeric,
  alter column hkd_usd type numeric using hkd_usd::numeric,
  alter column myr_usd type numeric using myr_usd::numeric,
  alter column aud_usd type numeric using aud_usd::numeric,
  alter column nzd_usd type numeric using nzd_usd::numeric,
  alter column cad_usd type numeric using cad_usd::numeric,
  alter column sek_usd type numeric using sek_usd::numeric,
  alter column nok_usd type numeric using nok_usd::numeric,
  alter column dkk_usd type numeric using dkk_usd::numeric,
  alter column isk_usd type numeric using isk_usd::numeric,
  alter column try_usd type numeric using try_usd::numeric,
  alter column rub_usd type numeric using rub_usd::numeric,
  alter column zar_usd type numeric using zar_usd::numeric,
  alter column btc_usd type numeric using btc_usd::numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_rate_observations_batch_id_fkey'
      and conrelid = 'public.market_rate_observations'::regclass
  ) then
    alter table public.market_rate_observations
      add constraint market_rate_observations_batch_id_fkey
      foreign key (batch_id)
      references public.market_rates(id)
      on delete cascade
      not valid;
  end if;
end;
$$;

create index if not exists market_rate_observations_batch_instrument_idx
  on public.market_rate_observations (batch_id, instrument_code);

create index if not exists market_rates_created_id_idx
  on public.market_rates (created_at, id);

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
    'currency:TRY', 'currency:RUB', 'currency:ZAR'
  ]::text[];
$$;

create or replace function private.market_rate_snapshot_decimal_v1(p_value text)
returns numeric
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  v_value numeric;
begin
  if length(p_value) > 1000
    or p_value !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
    or p_value !~ '[1-9]'
  then
    raise exception using errcode = '22023', message = 'snapshot_invalid_decimal';
  end if;

  begin
    v_value := p_value::numeric;
  exception when others then
    raise exception using errcode = '22023', message = 'snapshot_invalid_decimal';
  end;

  if v_value <= 0 or v_value::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using errcode = '22023', message = 'snapshot_invalid_decimal';
  end if;
  return v_value;
end;
$$;

create or replace function private.market_rate_snapshot_timestamp_v1(
  p_value jsonb,
  p_captured_at timestamptz
)
returns timestamptz
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_value timestamptz;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(p_value) is distinct from 'string' then
    raise exception using errcode = '22023', message = 'snapshot_invalid_observation';
  end if;

  begin
    v_value := (p_value #>> '{}')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = 'snapshot_invalid_observation';
  end;

  if not isfinite(v_value) or v_value > p_captured_at then
    raise exception using errcode = '22023', message = 'snapshot_invalid_observation';
  end if;
  return v_value;
end;
$$;

create or replace function private.market_rate_snapshot_root_payload_v1(p_snapshot_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'goldUsdPerGram', root.gold_usd_per_gram::text,
    'silverUsdPerGram', root.silver_usd_per_gram::text,
    'platinumUsdPerGram', root.platinum_usd_per_gram::text,
    'palladiumUsdPerGram', root.palladium_usd_per_gram::text,
    'fiatUsdPerUnit', jsonb_build_object(
      'EGP', root.egp_usd::text, 'SAR', root.sar_usd::text,
      'AED', root.aed_usd::text, 'KWD', root.kwd_usd::text,
      'QAR', root.qar_usd::text, 'BHD', root.bhd_usd::text,
      'OMR', root.omr_usd::text, 'JOD', root.jod_usd::text,
      'IQD', root.iqd_usd::text, 'LYD', root.lyd_usd::text,
      'TND', root.tnd_usd::text, 'MAD', root.mad_usd::text,
      'DZD', root.dzd_usd::text, 'EUR', root.eur_usd::text,
      'GBP', root.gbp_usd::text, 'JPY', root.jpy_usd::text,
      'CHF', root.chf_usd::text, 'CNY', root.cny_usd::text,
      'INR', root.inr_usd::text, 'KRW', root.krw_usd::text,
      'KPW', root.kpw_usd::text, 'SGD', root.sgd_usd::text,
      'HKD', root.hkd_usd::text, 'MYR', root.myr_usd::text,
      'AUD', root.aud_usd::text, 'NZD', root.nzd_usd::text,
      'CAD', root.cad_usd::text, 'SEK', root.sek_usd::text,
      'NOK', root.nok_usd::text, 'DKK', root.dkk_usd::text,
      'ISK', root.isk_usd::text, 'TRY', root.try_usd::text,
      'RUB', root.rub_usd::text, 'ZAR', root.zar_usd::text,
      'BTC', root.btc_usd::text
    ),
    'providerMetalObservedAt', root.timestamp_metal,
    'providerCurrencyObservedAt', root.timestamp_currency
  )
  from public.market_rates as root
  where root.id = p_snapshot_id;
$$;

create or replace function private.market_rate_snapshot_observation_payload_v1(
  p_snapshot_id uuid,
  p_include_persisted_fields boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      case when p_include_persisted_fields then
        jsonb_build_object(
          'id', observation.id,
          'batchId', observation.batch_id,
          'capturedAt', observation.created_at,
          'instrumentCode', observation.instrument_code,
          'valueDecimal', observation.value_decimal::text,
          'unit', observation.unit,
          'orientation', observation.orientation,
          'providerObservedAt', observation.provider_observed_at,
          'source', observation.source,
          'quality', observation.quality
        )
      else
        jsonb_build_object(
          'instrumentCode', observation.instrument_code,
          'valueDecimal', observation.value_decimal::text,
          'unit', observation.unit,
          'orientation', observation.orientation,
          'providerObservedAt', observation.provider_observed_at,
          'source', observation.source,
          'quality', observation.quality
        )
      end
      order by observation.instrument_code, observation.id
    ),
    '[]'::jsonb
  )
  from public.market_rate_observations as observation
  where observation.batch_id = p_snapshot_id;
$$;

create or replace function private.market_rate_snapshot_is_complete_v1(p_snapshot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    count(*) = 37
      and count(distinct observation.instrument_code) = 37
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

create or replace function private.market_rate_snapshot_envelope_v1(p_snapshot_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'snapshotId', root.id,
    'capturedAt', root.created_at,
    'root', private.market_rate_snapshot_root_payload_v1(root.id),
    'observations', private.market_rate_snapshot_observation_payload_v1(root.id, true)
  )
  from public.market_rates as root
  where root.id = p_snapshot_id;
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

  if jsonb_array_length(p_observations) <> 37
    or (
      select count(distinct item ->> 'instrumentCode')
      from jsonb_array_elements(p_observations) as item
    ) <> 37
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

create or replace function public.pull_market_rate_snapshots_page_v1(
  p_upper_watermark timestamptz default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_server_now timestamptz := statement_timestamp();
  v_upper_watermark timestamptz;
  v_snapshots jsonb;
  v_has_more boolean;
  v_cursor jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'market_rate_snapshot_invalid_limit';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null)
    or (p_cursor_created_at is not null and not isfinite(p_cursor_created_at))
  then
    raise exception using errcode = '22023', message = 'market_rate_snapshot_invalid_cursor';
  end if;
  if p_upper_watermark is not null
    and (not isfinite(p_upper_watermark) or p_upper_watermark > v_server_now)
  then
    raise exception using errcode = '22023', message = 'market_rate_snapshot_invalid_upper_watermark';
  end if;

  v_upper_watermark := coalesce(p_upper_watermark, v_server_now);
  if p_cursor_created_at is not null and p_cursor_created_at > v_upper_watermark then
    raise exception using errcode = '22023', message = 'market_rate_snapshot_invalid_cursor';
  end if;

  with candidates as (
    select root.id, root.created_at
    from public.market_rates as root
    where root.created_at <= v_upper_watermark
      and (
        p_cursor_created_at is null
        or (root.created_at, root.id) > (p_cursor_created_at, p_cursor_id)
      )
      and private.market_rate_snapshot_is_complete_v1(root.id)
    order by root.created_at, root.id
    limit p_limit + 1
  ), page as (
    select candidate.id, candidate.created_at
    from candidates as candidate
    order by candidate.created_at, candidate.id
    limit p_limit
  )
  select
    coalesce(
      (select jsonb_agg(
        private.market_rate_snapshot_envelope_v1(page_row.id)
        order by page_row.created_at, page_row.id
      ) from page as page_row),
      '[]'::jsonb
    ),
    (select count(*) > p_limit from candidates),
    (select jsonb_build_object('createdAt', page_row.created_at, 'id', page_row.id)
      from page as page_row
      order by page_row.created_at desc, page_row.id desc
      limit 1)
  into v_snapshots, v_has_more, v_cursor;

  if not v_has_more then
    v_cursor := null;
  end if;

  return jsonb_build_object(
    'snapshots', v_snapshots,
    'upperWatermark', v_upper_watermark,
    'nextCursor', v_cursor
  );
end;
$$;

revoke all on function public.persist_market_rate_snapshot_v1(uuid, timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_market_rate_snapshot_v1(uuid, timestamptz, jsonb, jsonb)
  to service_role;

revoke all on function public.pull_market_rate_snapshots_page_v1(timestamptz, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.pull_market_rate_snapshots_page_v1(timestamptz, timestamptz, uuid, integer)
  to authenticated, service_role;

revoke all on function private.market_rate_snapshot_required_instruments_v1()
  from public, anon, authenticated;
revoke all on function private.market_rate_snapshot_decimal_v1(text)
  from public, anon, authenticated;
revoke all on function private.market_rate_snapshot_timestamp_v1(jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function private.market_rate_snapshot_root_payload_v1(uuid)
  from public, anon, authenticated;
revoke all on function private.market_rate_snapshot_observation_payload_v1(uuid, boolean)
  from public, anon, authenticated;
revoke all on function private.market_rate_snapshot_is_complete_v1(uuid)
  from public, anon, authenticated;
revoke all on function private.market_rate_snapshot_envelope_v1(uuid)
  from public, anon, authenticated;

comment on function public.persist_market_rate_snapshot_v1(uuid, timestamptz, jsonb, jsonb)
  is 'Persists one exact market-rate root plus exactly 37 bound observations atomically.';
comment on function public.pull_market_rate_snapshots_page_v1(timestamptz, timestamptz, uuid, integer)
  is 'Pages only complete valid exact market-rate snapshot envelopes under one fixed watermark.';
