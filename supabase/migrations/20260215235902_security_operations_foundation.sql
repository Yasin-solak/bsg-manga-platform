-- ============================================
-- BSG Manga | Security & Operations Foundation
-- Date: 2026-02-15
-- ============================================

begin;

-- --------------------------------------------
-- Users: structured ban metadata
-- --------------------------------------------
alter table public.users
  add column if not exists ban_reason text,
  add column if not exists ban_until timestamptz,
  add column if not exists banned_by uuid references public.users(id) on delete set null,
  add column if not exists banned_at timestamptz;

create index if not exists users_ban_until_idx on public.users (ban_until);
create index if not exists users_banned_by_idx on public.users (banned_by);

-- --------------------------------------------
-- Security events table
-- --------------------------------------------
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (length(trim(source)) > 0),
  event_type text not null check (length(trim(event_type)) > 0),
  severity text not null
    check (severity in ('low', 'medium', 'high', 'critical')),
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.users(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists security_events_created_at_idx on public.security_events (created_at desc);
create index if not exists security_events_severity_idx on public.security_events (severity);
create index if not exists security_events_source_idx on public.security_events (source);
create index if not exists security_events_event_type_idx on public.security_events (event_type);
create index if not exists security_events_actor_user_id_idx on public.security_events (actor_user_id);
create index if not exists security_events_target_user_id_idx on public.security_events (target_user_id);
create index if not exists security_events_metadata_gin_idx on public.security_events using gin (metadata);

alter table public.security_events enable row level security;

drop policy if exists security_events_select_admin on public.security_events;
create policy security_events_select_admin
  on public.security_events
  for select
  using (public.is_admin());

drop policy if exists security_events_insert_admin on public.security_events;
create policy security_events_insert_admin
  on public.security_events
  for insert
  with check (public.is_admin());

grant select, insert on public.security_events to authenticated;

-- --------------------------------------------
-- Security RPC helpers
-- --------------------------------------------
create or replace function public.create_security_event(
  p_source text,
  p_event_type text,
  p_severity text default 'low',
  p_message text default '',
  p_target_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_event_id uuid;
  v_source text := lower(trim(coalesce(p_source, '')));
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_severity text := lower(trim(coalesce(p_severity, 'low')));
  v_message text := trim(coalesce(p_message, ''));
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if v_actor_id is null then
    raise exception 'Kullanici dogrulanamadi.';
  end if;

  if v_source = '' then
    raise exception 'source bos olamaz.';
  end if;

  if v_event_type = '' then
    raise exception 'event_type bos olamaz.';
  end if;

  if v_severity not in ('low', 'medium', 'high', 'critical') then
    raise exception 'Gecersiz severity degeri.';
  end if;

  if p_target_user_id is not null and not exists (
    select 1
    from public.users u
    where u.id = p_target_user_id
  ) then
    raise exception 'Hedef kullanici bulunamadi.';
  end if;

  insert into public.security_events (
    source,
    event_type,
    severity,
    message,
    metadata,
    actor_user_id,
    target_user_id
  )
  values (
    v_source,
    v_event_type,
    v_severity,
    left(v_message, 500),
    coalesce(p_metadata, '{}'::jsonb),
    v_actor_id,
    p_target_user_id
  )
  returning id into v_event_id;

  begin
    perform public.create_admin_audit_log(
      'security.event.create',
      'security_event',
      v_event_id::text,
      format('Security event olusturuldu (%s/%s).', v_source, v_event_type),
      jsonb_build_object(
        'severity', v_severity,
        'targetUserId', p_target_user_id,
        'source', v_source
      )
    );
  exception
    when others then
      null;
  end;

  return v_event_id;
end;
$$;

revoke all on function public.create_security_event(text, text, text, text, uuid, jsonb) from public;
grant execute on function public.create_security_event(text, text, text, text, uuid, jsonb) to authenticated;

create or replace function public.list_security_events(
  p_limit int default 120,
  p_severity text default null,
  p_source text default null,
  p_search text default null
)
returns table (
  id uuid,
  event_type text,
  source text,
  severity text,
  message text,
  metadata jsonb,
  actor_user_id uuid,
  actor_username text,
  actor_avatar_url text,
  target_user_id uuid,
  target_username text,
  target_avatar_url text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 120), 400));
  v_severity text := nullif(lower(trim(coalesce(p_severity, ''))), '');
  v_source text := nullif(lower(trim(coalesce(p_source, ''))), '');
  v_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  return query
  select
    se.id,
    se.event_type,
    se.source,
    se.severity,
    se.message,
    se.metadata,
    se.actor_user_id,
    actor.username as actor_username,
    actor.avatar_url as actor_avatar_url,
    se.target_user_id,
    target_user.username as target_username,
    target_user.avatar_url as target_avatar_url,
    se.created_at
  from public.security_events se
  left join public.users actor on actor.id = se.actor_user_id
  left join public.users target_user on target_user.id = se.target_user_id
  where
    (v_severity is null or se.severity = v_severity)
    and (v_source is null or se.source = v_source)
    and (
      v_search is null
      or lower(se.source) like '%' || v_search || '%'
      or lower(se.event_type) like '%' || v_search || '%'
      or lower(se.message) like '%' || v_search || '%'
      or lower(se.metadata::text) like '%' || v_search || '%'
      or lower(coalesce(actor.username, '')) like '%' || v_search || '%'
      or lower(coalesce(target_user.username, '')) like '%' || v_search || '%'
    )
  order by se.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.list_security_events(int, text, text, text) from public;
grant execute on function public.list_security_events(int, text, text, text) to authenticated;

create or replace function public.get_security_overview(
  p_window_hours int default 24
)
returns table (
  window_hours int,
  total_events bigint,
  high_events bigint,
  critical_events bigint,
  pending_reports bigint,
  banned_users bigint,
  code_redemptions bigint,
  suspicious_redeemers bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_hours int := greatest(1, least(coalesce(p_window_hours, 24), 24 * 14));
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  return query
  with cfg as (
    select v_window_hours as h
  ),
  merged_redemptions as (
    select
      ucr.user_id as redeem_user_id,
      ucr.redeemed_at
    from public.user_code_redemptions ucr, cfg
    where ucr.redeemed_at >= now() - make_interval(hours => cfg.h)

    union all

    select
      fcr.redeemed_by as redeem_user_id,
      fcr.redeemed_at
    from public.fansub_code_redemptions fcr, cfg
    where fcr.redeemed_by is not null
      and fcr.redeemed_at >= now() - make_interval(hours => cfg.h)
  )
  select
    v_window_hours as window_hours,
    (
      select count(*)
      from public.security_events se
      where se.created_at >= now() - make_interval(hours => v_window_hours)
    ) as total_events,
    (
      select count(*)
      from public.security_events se
      where se.created_at >= now() - make_interval(hours => v_window_hours)
        and se.severity in ('high', 'critical')
    ) as high_events,
    (
      select count(*)
      from public.security_events se
      where se.created_at >= now() - make_interval(hours => v_window_hours)
        and se.severity = 'critical'
    ) as critical_events,
    (
      select count(*)
      from public.reports r
      where r.status = 'pending'
    ) as pending_reports,
    (
      select count(*)
      from public.users u
      where coalesce(u.is_banned, false) = true
    ) as banned_users,
    (
      select count(*)
      from merged_redemptions
    ) as code_redemptions,
    (
      select count(*)
      from (
        select mr.redeem_user_id
        from merged_redemptions mr
        where mr.redeem_user_id is not null
        group by mr.redeem_user_id
        having count(*) >= 3
      ) suspicious
    ) as suspicious_redeemers;
end;
$$;

revoke all on function public.get_security_overview(int) from public;
grant execute on function public.get_security_overview(int) to authenticated;

create or replace function public.list_redeem_anomaly_users(
  p_window_hours int default 24,
  p_min_count int default 3,
  p_limit int default 20
)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  total_redemptions bigint,
  user_wallet_redemptions bigint,
  fansub_wallet_redemptions bigint,
  last_redeemed_at timestamptz,
  is_banned boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_hours int := greatest(1, least(coalesce(p_window_hours, 24), 24 * 14));
  v_min_count int := greatest(2, least(coalesce(p_min_count, 3), 100));
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 100));
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  return query
  with merged as (
    select
      ucr.user_id,
      ucr.redeemed_at,
      'user'::text as target_type
    from public.user_code_redemptions ucr
    where ucr.redeemed_at >= now() - make_interval(hours => v_window_hours)

    union all

    select
      fcr.redeemed_by as user_id,
      fcr.redeemed_at,
      'fansub'::text as target_type
    from public.fansub_code_redemptions fcr
    where fcr.redeemed_by is not null
      and fcr.redeemed_at >= now() - make_interval(hours => v_window_hours)
  ),
  agg as (
    select
      m.user_id,
      count(*)::bigint as total_redemptions,
      count(*) filter (where m.target_type = 'user')::bigint as user_wallet_redemptions,
      count(*) filter (where m.target_type = 'fansub')::bigint as fansub_wallet_redemptions,
      max(m.redeemed_at) as last_redeemed_at
    from merged m
    group by m.user_id
    having count(*) >= v_min_count
    order by total_redemptions desc, last_redeemed_at desc
    limit v_limit
  )
  select
    u.id as user_id,
    u.username,
    u.avatar_url,
    a.total_redemptions,
    a.user_wallet_redemptions,
    a.fansub_wallet_redemptions,
    a.last_redeemed_at,
    coalesce(u.is_banned, false) as is_banned
  from agg a
  join public.users u on u.id = a.user_id
  order by a.total_redemptions desc, a.last_redeemed_at desc;
end;
$$;

revoke all on function public.list_redeem_anomaly_users(int, int, int) from public;
grant execute on function public.list_redeem_anomaly_users(int, int, int) to authenticated;

create or replace function public.set_user_ban_state(
  p_user_id uuid,
  p_is_banned boolean,
  p_ban_reason text default null,
  p_ban_until timestamptz default null
)
returns table (
  id uuid,
  is_banned boolean,
  ban_reason text,
  ban_until timestamptz,
  banned_by uuid,
  banned_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_reason text := nullif(trim(coalesce(p_ban_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if p_user_id is null then
    raise exception 'Kullanici secimi zorunlu.';
  end if;

  if p_is_banned = true and p_user_id = v_actor_id then
    raise exception 'Kendi hesabini banlayamazsin.';
  end if;

  if p_is_banned = true and p_ban_until is not null and p_ban_until <= now() then
    raise exception 'Gecersiz ban bitis zamani.';
  end if;

  update public.users u
  set
    is_banned = p_is_banned,
    ban_reason = case when p_is_banned then left(v_reason, 500) else null end,
    ban_until = case when p_is_banned then p_ban_until else null end,
    banned_by = case when p_is_banned then v_actor_id else null end,
    banned_at = case when p_is_banned then now() else null end,
    updated_at = now()
  where u.id = p_user_id;

  if not found then
    raise exception 'Kullanici bulunamadi.';
  end if;

  if p_is_banned then
    perform public.create_security_event(
      'admin',
      'user_banned',
      'high',
      coalesce(v_reason, 'Kullanici banlandi.'),
      p_user_id,
      jsonb_build_object('banUntil', p_ban_until)
    );
  else
    perform public.create_security_event(
      'admin',
      'user_unbanned',
      'medium',
      'Kullanici bani kaldirildi.',
      p_user_id,
      '{}'::jsonb
    );
  end if;

  return query
  select
    u.id,
    coalesce(u.is_banned, false),
    u.ban_reason,
    u.ban_until,
    u.banned_by,
    u.banned_at
  from public.users u
  where u.id = p_user_id;
end;
$$;

revoke all on function public.set_user_ban_state(uuid, boolean, text, timestamptz) from public;
grant execute on function public.set_user_ban_state(uuid, boolean, text, timestamptz) to authenticated;

-- --------------------------------------------
-- Feature flags: security namespace
-- --------------------------------------------
insert into public.feature_flags (
  key,
  label,
  description,
  is_enabled,
  rollout_percent,
  is_public,
  metadata
)
values
  ('security.incident_center', 'Guvenlik Olay Merkezi', 'Operasyon merkezindeki guvenlik olay akisinin gorunurlugunu kontrol eder.', true, 100, false, '{}'::jsonb),
  ('security.redeem_anomaly_watch', 'Redeem Anomali Izleme', 'Kod aktivasyon anomali metriklerini hesaplama/gosterme akislarini kontrol eder.', true, 100, false, '{}'::jsonb)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  metadata = coalesce(public.feature_flags.metadata, '{}'::jsonb) || excluded.metadata;

commit;
