-- Coin codes V2: metadata, paged read-model and atomic admin mutations.
-- Runtime data cannot be inferred from this migration; the screen shows only the RPC result.

begin;

alter table public.redeem_codes
  add column if not exists series_label text,
  add column if not exists distribution_channel text,
  add column if not exists notes text,
  add column if not exists created_by uuid references public.users(id) on delete set null;

alter table public.redeem_codes
  drop constraint if exists redeem_codes_series_label_length,
  add constraint redeem_codes_series_label_length
    check (series_label is null or char_length(series_label) between 2 and 80),
  drop constraint if exists redeem_codes_distribution_channel_length,
  add constraint redeem_codes_distribution_channel_length
    check (distribution_channel is null or char_length(distribution_channel) between 2 and 60),
  drop constraint if exists redeem_codes_notes_length,
  add constraint redeem_codes_notes_length
    check (notes is null or char_length(notes) <= 500);

create index if not exists redeem_codes_created_at_id_idx
  on public.redeem_codes (created_at desc, id desc);

create index if not exists redeem_codes_active_created_at_idx
  on public.redeem_codes (created_at desc, id desc)
  where is_active = true;

create index if not exists redeem_codes_series_label_idx
  on public.redeem_codes (series_label)
  where series_label is not null;

create index if not exists user_code_redemptions_redeemed_at_id_idx
  on public.user_code_redemptions (redeemed_at desc, id desc);

create index if not exists fansub_code_redemptions_redeemed_at_id_idx
  on public.fansub_code_redemptions (redeemed_at desc, id desc);

create schema if not exists app_private;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.get_admin_coin_code_overview(
  p_period_days integer,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_days integer := coalesce(p_period_days, 7);
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Coin kodu ozeti icin admin yetkisi gerekir.';
  end if;
  if v_days not in (7, 30, 90) or p_as_of is null then
    raise exception using errcode = '22023', message = 'Gecersiz ozet donemi.';
  end if;

  with code_totals as materialized (
    select
      count(*)::integer as total_codes,
      count(*) filter (where c.is_active and c.expires_at > p_as_of and c.used_count < c.max_uses)::integer as active_codes,
      count(*) filter (where not c.is_active)::integer as passive_codes,
      count(*) filter (where c.expires_at <= p_as_of)::integer as expired_codes,
      count(*) filter (where c.used_count > 0)::integer as used_codes,
      coalesce(sum(c.used_count), 0)::bigint as total_activations,
      coalesce(sum(c.value::bigint * c.used_count::bigint), 0)::bigint as distributed_coin,
      coalesce(sum(c.value::bigint * greatest(c.max_uses - c.used_count, 0)::bigint)
        filter (where c.is_active and c.expires_at > p_as_of), 0)::bigint as active_exposure,
      coalesce(sum(c.value::bigint * c.max_uses::bigint), 0)::bigint as potential_distribution,
      count(*) filter (
        where c.is_active and c.expires_at > p_as_of
          and c.value::bigint * greatest(c.max_uses - c.used_count, 0)::bigint >= 100000000
      )::integer as high_risk_codes,
      count(*) filter (
        where c.is_active and c.expires_at > p_as_of
          and c.expires_at <= p_as_of + interval '7 days'
      )::integer as expiring_seven_days
    from public.redeem_codes as c
  ),
  activations as materialized (
    select redeemed_at, 'user'::text as target_type
    from public.user_code_redemptions
    where redeemed_at >= p_as_of - make_interval(days => v_days)
      and redeemed_at <= p_as_of
    union all
    select redeemed_at, 'fansub'::text
    from public.fansub_code_redemptions
    where redeemed_at >= p_as_of - make_interval(days => v_days)
      and redeemed_at <= p_as_of
  ),
  daily as materialized (
    select
      day::date as day,
      count(a.redeemed_at)::integer as activations,
      count(distinct a.target_type || ':' || a.redeemed_at::date::text)::integer as target_signals
    from generate_series(
      date_trunc('day', p_as_of - make_interval(days => v_days - 1)),
      date_trunc('day', p_as_of),
      interval '1 day'
    ) as day
    left join activations as a
      on a.redeemed_at >= day and a.redeemed_at < day + interval '1 day'
    group by day
    order by day
  )
  select jsonb_build_object(
    'generatedAt', p_as_of,
    'periodDays', v_days,
    'totalCodes', t.total_codes,
    'activeCodes', t.active_codes,
    'passiveCodes', t.passive_codes,
    'expiredCodes', t.expired_codes,
    'usedCodes', t.used_codes,
    'totalActivations', t.total_activations,
    'distributedCoin', t.distributed_coin,
    'activeExposureCoin', t.active_exposure,
    'potentialDistributionCoin', t.potential_distribution,
    'highRiskCodes', t.high_risk_codes,
    'expiringSevenDays', t.expiring_seven_days,
    'userActivations', (select count(*) from activations where target_type = 'user'),
    'fansubActivations', (select count(*) from activations where target_type = 'fansub'),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'activations', d.activations,
        'targetSignals', d.target_signals
      ) order by d.day)
      from daily as d
    ), '[]'::jsonb)
  )
  into v_result
  from code_totals as t;

  return v_result;
end;
$function$;

create or replace function public.get_admin_coin_code_overview(
  p_period_days integer default 7
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_admin_coin_code_overview(
    p_period_days,
    pg_catalog.statement_timestamp()
  );
$function$;

create or replace function app_private.list_admin_coin_codes_page(
  p_limit integer,
  p_search text,
  p_target_type text,
  p_status text,
  p_series_label text,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := coalesce(p_limit, 25);
  v_search text := nullif(upper(btrim(coalesce(p_search, ''))), '');
  v_target text := lower(btrim(coalesce(p_target_type, 'all')));
  v_status text := lower(btrim(coalesce(p_status, 'all')));
  v_series text := nullif(btrim(coalesce(p_series_label, '')), '');
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Coin kodu listesi icin admin yetkisi gerekir.';
  end if;
  if v_limit < 1 or v_limit > 100 or p_as_of is null then
    raise exception using errcode = '22023', message = 'Gecersiz sayfa parametresi.';
  end if;
  if v_search is not null and char_length(v_search) > 120 then
    raise exception using errcode = '22023', message = 'Arama metni en fazla 120 karakter olabilir.';
  end if;
  if v_target not in ('all', 'user', 'fansub', 'both')
     or v_status not in ('all', 'active', 'passive', 'expired', 'used') then
    raise exception using errcode = '22023', message = 'Gecersiz coin kodu filtresi.';
  end if;
  if (p_cursor_created_at is null) is distinct from (p_cursor_id is null) then
    raise exception using errcode = '22023', message = 'Cursor alanlari birlikte verilmelidir.';
  end if;

  with filtered as materialized (
    select c.*
    from public.redeem_codes as c
    where (v_search is null or c.code ilike '%' || replace(replace(v_search, '%', '\%'), '_', '\_') || '%' escape '\')
      and (v_target = 'all' or c.target_type = v_target)
      and (v_series is null or c.series_label = v_series)
      and (
        v_status = 'all'
        or (v_status = 'active' and c.is_active and c.expires_at > p_as_of and c.used_count < c.max_uses)
        or (v_status = 'passive' and not c.is_active)
        or (v_status = 'expired' and c.expires_at <= p_as_of)
        or (v_status = 'used' and c.used_count > 0)
      )
  ),
  page_rows as materialized (
    select *
    from filtered
    where p_cursor_created_at is null
       or (created_at, id) < (p_cursor_created_at, p_cursor_id)
    order by created_at desc, id desc
    limit v_limit + 1
  ),
  items as materialized (
    select * from page_rows order by created_at desc, id desc limit v_limit
  )
  select jsonb_build_object(
    'generatedAt', p_as_of,
    'total', (select count(*) from filtered),
    'hasNext', (select count(*) > v_limit from page_rows),
    'nextCursor', (
      select jsonb_build_object('createdAt', i.created_at, 'id', i.id)
      from items as i order by i.created_at, i.id limit 1
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'code', i.code,
        'value', i.value,
        'maxUses', i.max_uses,
        'usedCount', i.used_count,
        'targetType', i.target_type,
        'expiresAt', i.expires_at,
        'isActive', i.is_active,
        'createdAt', i.created_at,
        'seriesLabel', i.series_label,
        'distributionChannel', i.distribution_channel,
        'notes', i.notes,
        'createdBy', i.created_by
      ) order by i.created_at desc, i.id desc)
      from items as i
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

create or replace function public.list_admin_coin_codes_page(
  p_limit integer default 25,
  p_search text default null,
  p_target_type text default 'all',
  p_status text default 'all',
  p_series_label text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.list_admin_coin_codes_page(
    p_limit, p_search, p_target_type, p_status, p_series_label,
    p_cursor_created_at, p_cursor_id, pg_catalog.statement_timestamp()
  );
$function$;

create or replace function app_private.list_admin_coin_code_activations_page(
  p_limit integer,
  p_search text,
  p_target_type text,
  p_cursor_redeemed_at timestamptz,
  p_cursor_key text,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := coalesce(p_limit, 25);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_target text := lower(btrim(coalesce(p_target_type, 'all')));
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Aktivasyon listesi icin admin yetkisi gerekir.';
  end if;
  if v_limit < 1 or v_limit > 100 or v_target not in ('all', 'user', 'fansub') then
    raise exception using errcode = '22023', message = 'Gecersiz aktivasyon filtresi.';
  end if;
  if (p_cursor_redeemed_at is null) is distinct from (p_cursor_key is null) then
    raise exception using errcode = '22023', message = 'Aktivasyon cursor alanlari birlikte verilmelidir.';
  end if;

  with events as materialized (
    select
      'user:' || r.id::text as event_key,
      r.redeemed_at,
      'user'::text as target_type,
      c.id as code_id,
      c.code,
      c.value,
      u.id as user_id,
      u.username,
      u.avatar_url,
      null::uuid as fansub_id,
      null::text as fansub_name
    from public.user_code_redemptions as r
    join public.redeem_codes as c on c.id = r.code_id
    join public.users as u on u.id = r.user_id
    union all
    select
      'fansub:' || r.id::text,
      r.redeemed_at,
      'fansub'::text,
      c.id,
      c.code,
      c.value,
      u.id,
      u.username,
      u.avatar_url,
      f.id,
      f.name
    from public.fansub_code_redemptions as r
    join public.redeem_codes as c on c.id = r.code_id
    left join public.users as u on u.id = r.redeemed_by
    join public.fansubs as f on f.id = r.fansub_id
  ),
  filtered as materialized (
    select *
    from events
    where (v_target = 'all' or target_type = v_target)
      and (
        v_search is null
        or code ilike '%' || v_search || '%'
        or username ilike '%' || v_search || '%'
        or fansub_name ilike '%' || v_search || '%'
      )
  ),
  page_rows as materialized (
    select *
    from filtered
    where p_cursor_redeemed_at is null
       or (redeemed_at, event_key) < (p_cursor_redeemed_at, p_cursor_key)
    order by redeemed_at desc, event_key desc
    limit v_limit + 1
  ),
  items as materialized (
    select * from page_rows order by redeemed_at desc, event_key desc limit v_limit
  )
  select jsonb_build_object(
    'generatedAt', p_as_of,
    'total', (select count(*) from filtered),
    'hasNext', (select count(*) > v_limit from page_rows),
    'nextCursor', (
      select jsonb_build_object('redeemedAt', i.redeemed_at, 'key', i.event_key)
      from items as i order by i.redeemed_at, i.event_key limit 1
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.event_key,
        'redeemedAt', i.redeemed_at,
        'targetType', i.target_type,
        'codeId', i.code_id,
        'code', i.code,
        'creditedValue', i.value,
        'userId', i.user_id,
        'username', coalesce(i.username, 'Bilinmeyen Kullanici'),
        'userAvatarUrl', i.avatar_url,
        'fansubId', i.fansub_id,
        'fansubName', i.fansub_name
      ) order by i.redeemed_at desc, i.event_key desc)
      from items as i
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

create or replace function public.list_admin_coin_code_activations_page(
  p_limit integer default 25,
  p_search text default null,
  p_target_type text default 'all',
  p_cursor_redeemed_at timestamptz default null,
  p_cursor_key text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.list_admin_coin_code_activations_page(
    p_limit, p_search, p_target_type, p_cursor_redeemed_at, p_cursor_key,
    pg_catalog.statement_timestamp()
  );
$function$;

create or replace function app_private.create_admin_coin_code_batch(
  p_value integer,
  p_count integer,
  p_max_uses integer,
  p_target_type text,
  p_expires_at timestamptz,
  p_prefix text,
  p_series_label text default null,
  p_distribution_channel text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := app_private.current_public_user_id();
  v_prefix text := regexp_replace(upper(btrim(coalesce(p_prefix, 'MZ'))), '[^A-Z0-9]', '', 'g');
  v_series text := nullif(btrim(coalesce(p_series_label, '')), '');
  v_channel text := nullif(btrim(coalesce(p_distribution_channel, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_rows jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Kod uretimi icin admin yetkisi gerekir.';
  end if;
  if p_value < 1 or p_count < 1 or p_count > 500 or p_max_uses < 1 then
    raise exception using errcode = '22023', message = 'Kod degeri, adet veya kullanim limiti gecersiz.';
  end if;
  if p_target_type not in ('user', 'fansub', 'both') or p_expires_at <= statement_timestamp() then
    raise exception using errcode = '22023', message = 'Kod hedefi veya son kullanma tarihi gecersiz.';
  end if;
  if char_length(v_prefix) < 2 or char_length(v_prefix) > 8
     or (v_series is not null and char_length(v_series) > 80)
     or (v_channel is not null and char_length(v_channel) > 60)
     or (v_notes is not null and char_length(v_notes) > 500) then
    raise exception using errcode = '22023', message = 'Kod metadata uzunluklari gecersiz.';
  end if;

  with inserted as (
    insert into public.redeem_codes (
      code, value, max_uses, used_count, expires_at, target_type, is_active,
      series_label, distribution_channel, notes, created_by
    )
    select
      v_prefix || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))
        || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)),
      p_value, p_max_uses, 0, p_expires_at, p_target_type, true,
      v_series, v_channel, v_notes, v_actor_id
    from generate_series(1, p_count)
    returning *
  )
  select jsonb_agg(jsonb_build_object(
    'id', i.id, 'code', i.code, 'value', i.value, 'maxUses', i.max_uses,
    'usedCount', i.used_count, 'targetType', i.target_type,
    'expiresAt', i.expires_at, 'isActive', i.is_active, 'createdAt', i.created_at,
    'seriesLabel', i.series_label, 'distributionChannel', i.distribution_channel,
    'notes', i.notes, 'createdBy', i.created_by
  ) order by i.created_at desc, i.id desc)
  into v_rows
  from inserted as i;

  perform public.create_admin_audit_log(
    'coin_code.batch_create',
    'redeem_code_batch',
    null,
    format('%s adet coin kodu uretildi.', p_count),
    jsonb_build_object(
      'count', p_count, 'value', p_value, 'maxUses', p_max_uses,
      'targetType', p_target_type, 'expiresAt', p_expires_at,
      'prefix', v_prefix, 'seriesLabel', v_series, 'distributionChannel', v_channel
    )
  );

  return coalesce(v_rows, '[]'::jsonb);
end;
$function$;

create or replace function public.create_admin_coin_code_batch(
  p_value integer,
  p_count integer,
  p_max_uses integer,
  p_target_type text,
  p_expires_at timestamptz,
  p_prefix text,
  p_series_label text default null,
  p_distribution_channel text default null,
  p_notes text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $function$
  select app_private.create_admin_coin_code_batch(
    p_value, p_count, p_max_uses, p_target_type, p_expires_at, p_prefix,
    p_series_label, p_distribution_channel, p_notes
  );
$function$;

create or replace function app_private.bulk_set_admin_coin_codes_active(
  p_code_ids uuid[],
  p_is_active boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[] := coalesce(p_code_ids, array[]::uuid[]);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_updated integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Toplu kod islemi icin admin yetkisi gerekir.';
  end if;
  if cardinality(v_ids) < 1 or cardinality(v_ids) > 200 then
    raise exception using errcode = '22023', message = '1 ile 200 arasinda kod secilmelidir.';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then
    raise exception using errcode = '22023', message = 'Islem nedeni 5 ile 300 karakter arasinda olmalidir.';
  end if;

  update public.redeem_codes
  set is_active = p_is_active
  where id = any(v_ids)
    and is_active is distinct from p_is_active;
  get diagnostics v_updated = row_count;

  perform public.create_admin_audit_log(
    case when p_is_active then 'coin_code.bulk_activate' else 'coin_code.bulk_deactivate' end,
    'redeem_code',
    null,
    format('%s coin kodunun durumu toplu guncellendi.', v_updated),
    jsonb_build_object('requestedIds', v_ids, 'updatedCount', v_updated, 'reason', v_reason)
  );

  return jsonb_build_object('updatedCount', v_updated, 'isActive', p_is_active);
end;
$function$;

create or replace function public.bulk_set_admin_coin_codes_active(
  p_code_ids uuid[],
  p_is_active boolean,
  p_reason text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $function$
  select app_private.bulk_set_admin_coin_codes_active(
    p_code_ids, p_is_active, p_reason
  );
$function$;

revoke all on function public.get_admin_coin_code_overview(integer) from public, anon;
revoke all on function public.list_admin_coin_codes_page(integer, text, text, text, text, timestamptz, uuid) from public, anon;
revoke all on function public.list_admin_coin_code_activations_page(integer, text, text, timestamptz, text) from public, anon;
revoke all on function public.create_admin_coin_code_batch(integer, integer, integer, text, timestamptz, text, text, text, text) from public, anon;
revoke all on function public.bulk_set_admin_coin_codes_active(uuid[], boolean, text) from public, anon;

grant execute on function public.get_admin_coin_code_overview(integer) to authenticated, service_role;
grant execute on function public.list_admin_coin_codes_page(integer, text, text, text, text, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.list_admin_coin_code_activations_page(integer, text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.create_admin_coin_code_batch(integer, integer, integer, text, timestamptz, text, text, text, text) to authenticated, service_role;
grant execute on function public.bulk_set_admin_coin_codes_active(uuid[], boolean, text) to authenticated, service_role;

revoke all on function app_private.get_admin_coin_code_overview(integer, timestamptz) from public, anon, authenticated;
revoke all on function app_private.list_admin_coin_codes_page(integer, text, text, text, text, timestamptz, uuid, timestamptz) from public, anon, authenticated;
revoke all on function app_private.list_admin_coin_code_activations_page(integer, text, text, timestamptz, text, timestamptz) from public, anon, authenticated;
revoke all on function app_private.create_admin_coin_code_batch(integer, integer, integer, text, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke all on function app_private.bulk_set_admin_coin_codes_active(uuid[], boolean, text) from public, anon, authenticated;
grant execute on function app_private.get_admin_coin_code_overview(integer, timestamptz) to authenticated, service_role;
grant execute on function app_private.list_admin_coin_codes_page(integer, text, text, text, text, timestamptz, uuid, timestamptz) to authenticated, service_role;
grant execute on function app_private.list_admin_coin_code_activations_page(integer, text, text, timestamptz, text, timestamptz) to authenticated, service_role;
grant execute on function app_private.create_admin_coin_code_batch(integer, integer, integer, text, timestamptz, text, text, text, text) to authenticated, service_role;
grant execute on function app_private.bulk_set_admin_coin_codes_active(uuid[], boolean, text) to authenticated, service_role;

-- Close direct admin writes that bypass audit; the redeem RPC runs as definer.
revoke insert, update, delete on table public.redeem_codes from anon, authenticated;
grant select on table public.redeem_codes to authenticated;

commit;
