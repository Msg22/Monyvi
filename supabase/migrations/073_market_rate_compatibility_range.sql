-- Keep exact numeric evidence while rejecting values that cannot populate the
-- mobile compatibility columns. Do not clamp, round, delete, or skip evidence.
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
  v_compatibility_value double precision;
begin
  if length(p_value) > 1000
    or p_value !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
    or p_value !~ '[1-9]'
  then
    raise exception using errcode = '22023', message = 'snapshot_invalid_decimal';
  end if;

  begin
    v_value := p_value::numeric;
    v_compatibility_value := p_value::double precision;
  exception when numeric_value_out_of_range or invalid_text_representation then
    raise exception using errcode = '22023', message = 'snapshot_invalid_decimal';
  end;

  if v_value <= 0
    or v_compatibility_value <= 0
    or v_compatibility_value in ('Infinity'::double precision, '-Infinity'::double precision, 'NaN'::double precision)
  then
    raise exception using errcode = '22023', message = 'snapshot_invalid_decimal';
  end if;
  return v_value;
end;
$$;

-- Existing incompatible complete snapshots need an explicit recovery decision.
-- Abort cutover with their identity instead of silently changing financial data.
do $$
declare
  v_snapshot record;
  v_root jsonb;
  v_rate text;
begin
  for v_snapshot in
    select id from public.market_rates
    where private.market_rate_snapshot_is_complete_v1(id)
  loop
    v_root := private.market_rate_snapshot_root_payload_v1(v_snapshot.id);
    begin
      perform private.market_rate_snapshot_decimal_v1(v_root ->> 'goldUsdPerGram');
      perform private.market_rate_snapshot_decimal_v1(v_root ->> 'silverUsdPerGram');
      perform private.market_rate_snapshot_decimal_v1(v_root ->> 'platinumUsdPerGram');
      perform private.market_rate_snapshot_decimal_v1(v_root ->> 'palladiumUsdPerGram');
      for v_rate in select value from jsonb_each_text(v_root -> 'fiatUsdPerUnit') loop
        perform private.market_rate_snapshot_decimal_v1(v_rate);
      end loop;
    exception when invalid_parameter_value then
      raise exception using
        errcode = '22023',
        message = 'snapshot_incompatible_existing_rate',
        detail = 'Snapshot ID: ' || v_snapshot.id::text,
        hint = 'Stop deployment and obtain an explicit recovery decision; do not delete or rewrite immutable evidence.';
    end;
  end loop;
end;
$$;
