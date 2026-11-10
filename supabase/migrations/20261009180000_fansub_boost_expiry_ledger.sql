begin;
-- Fansub boost: expiry + wallet ledger.
--
-- 1) Expiry is now automatic: formerly the level recomputed only when someone opened the fansub page
-- ; catalog, home page, custom notifications and fansub label
-- (fansub_has_boost_capability) read the old level. A scheduled job (10 min) drops expired
-- boosts and recomputes level and supporter state.
-- 2) Notifications: a renewal reminder to the supporter 3 days before expiry; on expiry notices to the supporter and
-- fansub managers. Once per boost (grant.metadata marks).
-- 3) Wallet ledger: boost spending writes to store_wallet_ledger as a debit (past
-- purchases retroactively too; balance unknown so balance_after is empty).

-- Gecmis satin almalarin defter kaydi (tekil: source_kind + source_ref + entry_type).
insert into public.store_wallet_ledger (user_id, order_id, source_kind, source_ref, entry_type, currency, amount, balance_after, metadata, created_at)
select g.supporter_user_id, null, 'fansub_boost', g.id::text, 'debit', 'Coin', -g.coin_cost, null,
  jsonb_build_object('fansub_id', g.fansub_id, 'plan_code', g.plan_code, 'boost_power', g.boost_power, 'backfill', true),
  g.created_at
from public.fansub_boost_grants g
where g.coin_cost > 0
on conflict (source_kind, source_ref, entry_type) do nothing;

-- No notification for boosts expired in the past (only from now on).
update public.fansub_boost_grants
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expiryNotifiedAt', now(), 'expiryWarnedAt', now())
where expires_at <= now();

create or replace function app_private.purchase_fansub_boost(p_fansub_id uuid, p_plan_code text, p_supporter_note text DEFAULT NULL::text, p_quantity integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := public.current_public_user_id();
  v_user public.users%rowtype;
  v_fansub public.fansubs%rowtype;
  v_plan public.fansub_boost_plans%rowtype;
  v_grant public.fansub_boost_grants%rowtype;
  v_supporter_state public.fansub_boost_supporter_states%rowtype;
  v_snapshot public.fansub_boost_snapshots%rowtype;
  v_supporter_note text := nullif(regexp_replace(trim(coalesce(p_supporter_note, '')), '\s+', ' ', 'g'), '');
  v_event_key text;
  v_member record;
  v_supporter_preview jsonb := '[]'::jsonb;
  v_duplicate_window interval := interval '12 seconds';
  v_new_user_stones integer := 0;
  v_quantity integer := coalesce(p_quantity, 1);
  v_total_coin_cost integer;
  v_total_boost_power integer;
begin
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if not public.is_feature_enabled('boost.system', false) then
    raise exception 'Fansub takviye sistemi su anda aktif degil.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  if v_quantity < 1 or v_quantity > 10 then
    raise exception 'Takviye adedi 1 ile 10 arasinda olmalidir.';
  end if;

  select * into v_user from public.users where id = v_user_id for update;

  if not found or coalesce(v_user.is_active, true) = false then
    raise exception 'Aktif kullanici bulunamadi.';
  end if;

  if coalesce(v_user.is_banned, false) = true then
    raise exception 'Bu islem icin hesabin aktif olmasi gerekir.';
  end if;

  select * into v_fansub from public.fansubs where id = p_fansub_id and coalesce(is_active, true) = true limit 1;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  select * into v_plan from public.fansub_boost_plans where code = lower(trim(coalesce(p_plan_code, ''))) and is_active = true limit 1;

  if not found then
    raise exception 'Takviye plani bulunamadi.';
  end if;

  if v_supporter_note is not null and char_length(v_supporter_note) > 220 then
    raise exception 'Destek notu en fazla 220 karakter olabilir.';
  end if;

  if v_supporter_note is not null and v_supporter_note ~* '(https?://|www\.)' then
    raise exception 'Destek notunda link paylasamazsiniz.';
  end if;

  if exists (
    select 1
    from public.fansub_boost_grants g
    where g.fansub_id = p_fansub_id
      and g.supporter_user_id = v_user_id
      and g.plan_code = v_plan.code
      and coalesce(g.supporter_note, '') = coalesce(v_supporter_note, '')
      and g.created_at >= now() - v_duplicate_window
  ) then
    raise exception 'Ayni takviye istegi yeni tamamlandi. Lutfen birkac saniye bekleyin.';
  end if;

  v_total_coin_cost := v_plan.coin_cost * v_quantity;
  v_total_boost_power := v_plan.boost_power * v_quantity;

  if coalesce(v_user.stones, 0) < v_total_coin_cost then
    raise exception 'Yeterli coin bulunamadi.';
  end if;

  update public.users set stones = stones - v_total_coin_cost where id = v_user_id returning stones into v_new_user_stones;

  insert into public.fansub_boost_grants (
    fansub_id, supporter_user_id, plan_id, plan_code, coin_cost, boost_power, duration_days, supporter_reward_tier,
    supporter_note, is_self_boost, starts_at, expires_at, metadata
  )
  values (
    p_fansub_id, v_user_id, v_plan.id, v_plan.code, v_total_coin_cost, v_total_boost_power, v_plan.duration_days,
    v_plan.supporter_reward_tier, v_supporter_note,
    exists (select 1 from public.fansub_members fm where fm.fansub_id = p_fansub_id and fm.user_id = v_user_id),
    now(), now() + make_interval(days => v_plan.duration_days),
    jsonb_build_object('planName', v_plan.name, 'supporterUsername', v_user.username, 'quantity', v_quantity)
  )
  returning * into v_grant;

  -- Wallet ledger: boost spending leaves a trace in the user Coin history.
  insert into public.store_wallet_ledger (user_id, order_id, source_kind, source_ref, entry_type, currency, amount, balance_after, metadata)
  values (v_user_id, null, 'fansub_boost', v_grant.id::text, 'debit', 'Coin', -v_total_coin_cost, v_new_user_stones,
    jsonb_build_object('fansub_id', p_fansub_id, 'plan_code', v_plan.code, 'quantity', v_quantity, 'boost_power', v_total_boost_power));

  v_supporter_state := public.refresh_fansub_boost_supporter_state(p_fansub_id, v_user_id);
  v_snapshot := public.refresh_fansub_boost_snapshot(p_fansub_id);
  v_event_key := format('fansub-boost:%s:%s', v_grant.id::text, p_fansub_id::text);
  v_supporter_preview := coalesce((
    select jsonb_agg(row_to_json(preview_row))
    from public.list_public_fansub_boost_supporters_preview(p_fansub_id, 6) preview_row
  ), '[]'::jsonb);

  for v_member in
    select fm.user_id
    from public.fansub_members fm
    where fm.fansub_id = p_fansub_id
      and fm.role = 'admin'
      and fm.user_id <> v_user_id
  loop
    perform public.push_notification(
      v_member.user_id,
      'system',
      'Fansub takviyesi alindi',
      format('%s, %s adet takviye etkinlestirdi.', coalesce(v_user.username, 'Bir destekci'), v_quantity),
      jsonb_build_object(
        'event', 'fansub_boost_purchased',
        'fansub_id', p_fansub_id,
        'grant_id', v_grant.id,
        'plan_code', v_plan.code,
        'plan_name', v_plan.name,
        'quantity', v_quantity,
        'supporter_user_id', v_user_id,
        'supporter_username', v_user.username,
        'event_key', format('%s:%s', v_event_key, v_member.user_id::text)
      ),
      'bolt'
    );
  end loop;

  return jsonb_build_object(
    'grantId', v_grant.id,
    'fansubId', p_fansub_id,
    'planCode', v_plan.code,
    'planName', v_plan.name,
    'coinCost', v_total_coin_cost,
    'boostPower', v_total_boost_power,
    'quantity', v_quantity,
    'durationDays', v_plan.duration_days,
    'supporterRewardTier', v_plan.supporter_reward_tier,
    'startsAt', v_grant.starts_at,
    'expiresAt', v_grant.expires_at,
    'newUserStones', greatest(v_new_user_stones, 0),
    'supporterPreview', v_supporter_preview,
    'supporterState', row_to_json(v_supporter_state),
    'snapshot', row_to_json(v_snapshot)
  );
end;
$function$;

-- Scheduled job: reminder, expiry, level refresh, notification. However many times it runs
-- the notification goes once per boost (metadata marks, row lock).
create or replace function app_private.fansub_boost_expiry_tick()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_grant record;
  v_fansub record;
  v_snapshot public.fansub_boost_snapshots;
  v_warned integer := 0;
  v_expired integer := 0;
  v_refreshed integer := 0;
  v_member record;
begin
  -- 1) Bitise 3 gun kala destekciye yenileme hatirlatmasi.
  for v_grant in
    select g.id, g.supporter_user_id, g.fansub_id, g.expires_at, f.name as fansub_name, f.slug as fansub_slug
    from public.fansub_boost_grants g join public.fansubs f on f.id = g.fansub_id
    where g.status = 'active' and g.expires_at > now() and g.expires_at <= now() + interval '3 days'
      and not (coalesce(g.metadata, '{}'::jsonb) ? 'expiryWarnedAt')
    order by g.expires_at
    for update of g skip locked
  loop
    update public.fansub_boost_grants set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expiryWarnedAt', now()) where id = v_grant.id;
    perform public.push_notification(
      v_grant.supporter_user_id, 'system', 'Takviyen bitmek üzere',
      format('%s için takviyen %s tarihinde bitiyor. Yenilersen fansubun seviyesi korunur.', v_grant.fansub_name, to_char(v_grant.expires_at at time zone 'Europe/Istanbul', 'DD.MM HH24:MI')),
      jsonb_build_object('event', 'fansub_boost_expiring', 'fansub_id', v_grant.fansub_id, 'fansub_slug', v_grant.fansub_slug, 'grant_id', v_grant.id,
        'event_key', format('fansub-boost-expiring:%s', v_grant.id)),
      'bolt'
    );
    v_warned := v_warned + 1;
  end loop;

  -- 2) Expired boosts: level refreshes per fansub, notification goes.
  for v_fansub in
    select g.fansub_id, f.name as fansub_name, f.slug as fansub_slug,
      array_agg(g.id) as grant_ids, array_agg(distinct g.supporter_user_id) as supporters
    from public.fansub_boost_grants g join public.fansubs f on f.id = g.fansub_id
    where g.expires_at <= now() and not (coalesce(g.metadata, '{}'::jsonb) ? 'expiryNotifiedAt')
    group by g.fansub_id, f.name, f.slug
  loop
    update public.fansub_boost_grants
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expiryNotifiedAt', now())
    where id = any(v_fansub.grant_ids) and not (coalesce(metadata, '{}'::jsonb) ? 'expiryNotifiedAt');
    if not found then
      continue;
    end if;

    v_snapshot := public.refresh_fansub_boost_snapshot(v_fansub.fansub_id);
    perform public.refresh_fansub_boost_supporter_state(v_fansub.fansub_id, s) from unnest(v_fansub.supporters) s;

    perform public.push_notification(
      s, 'system', 'Takviyen sona erdi',
      format('%s için takviyenin süresi doldu. Desteğin için teşekkürler; yeniden takviye ederek seviyeyi koruyabilirsin.', v_fansub.fansub_name),
      jsonb_build_object('event', 'fansub_boost_expired', 'fansub_id', v_fansub.fansub_id, 'fansub_slug', v_fansub.fansub_slug,
        'event_key', format('fansub-boost-expired:%s:%s:%s', v_fansub.fansub_id, s, to_char(now(), 'YYYYMMDDHH24MI'))),
      'bolt'
    ) from unnest(v_fansub.supporters) s;

    for v_member in
      select fm.user_id from public.fansub_members fm where fm.fansub_id = v_fansub.fansub_id and fm.role = 'admin'
    loop
      perform public.push_notification(
        v_member.user_id, 'system', 'Takviye süresi doldu',
        case when v_snapshot.tier_level > 0
          then format('%s takviyenin süresi doldu. %s şu an Seviye %s (%s güç).', cardinality(v_fansub.grant_ids), v_fansub.fansub_name, v_snapshot.tier_level, v_snapshot.active_power)
          else format('%s takviyenin süresi doldu. %s şu an takviye seviyesinde değil.', cardinality(v_fansub.grant_ids), v_fansub.fansub_name)
        end,
        jsonb_build_object('event', 'fansub_boost_tier_changed', 'fansub_id', v_fansub.fansub_id, 'tier_level', v_snapshot.tier_level,
          'event_key', format('fansub-boost-tier:%s:%s:%s', v_fansub.fansub_id, v_member.user_id, to_char(now(), 'YYYYMMDDHH24MI'))),
        'bolt'
      );
    end loop;
    v_expired := v_expired + cardinality(v_fansub.grant_ids);
  end loop;

  -- 3) Stale snapshots left behind (still showing a level with an ended boost) refresh.
  for v_fansub in
    select s.fansub_id from public.fansub_boost_snapshots s
    where (s.tier_level > 0 or s.active_power > 0)
      and (s.last_grant_expires_at is null or s.last_grant_expires_at <= now()
        or exists (select 1 from public.fansub_boost_grants g where g.fansub_id = s.fansub_id and g.status = 'active' and g.expires_at <= now()))
  loop
    perform public.refresh_fansub_boost_snapshot(v_fansub.fansub_id);
    v_refreshed := v_refreshed + 1;
  end loop;

  return jsonb_build_object('warned', v_warned, 'expired', v_expired, 'refreshed', v_refreshed);
end;
$$;

revoke all on function app_private.fansub_boost_expiry_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'fansub-boost-expiry';
select cron.schedule('fansub-boost-expiry', '*/10 * * * *', 'select app_private.fansub_boost_expiry_tick();');
commit;
