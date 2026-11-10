-- ============================================
-- BSG Manga | Account session management phase 2
-- Date: 2026-02-28
-- ============================================

begin;

alter table public.auth_session_events
  add column if not exists device_id text,
  add column if not exists device_label text,
  add column if not exists platform text,
  add column if not exists browser text,
  add column if not exists user_agent text,
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz,
  add column if not exists revoke_reason text;

update public.auth_session_events
set last_seen_at = coalesce(last_seen_at, claimed_at)
where last_seen_at is null;

create unique index if not exists auth_session_events_auth_user_id_session_id_key
  on public.auth_session_events (auth_user_id, session_id);

create or replace function public.is_auth_session_revoked(p_auth_user_id uuid, p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.auth_session_events e
    where e.auth_user_id = p_auth_user_id
      and e.session_id = p_session_id
      and e.revoked_at is not null
  );
$$;

create or replace function public.current_public_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
    and coalesce(u.is_active, true) = true
    and coalesce(u.is_banned, false) = false
    and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
    and (
      u.active_session_id is null
      or u.active_session_id = public.current_auth_session_id()
    )
  limit 1;
$$;

create or replace function public.current_app_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_is_active boolean;
  v_is_banned boolean;
  v_active_session_id uuid;
begin
  if auth.uid() is null then
    return 'anon';
  end if;

  select
    u.role,
    coalesce(u.is_active, true),
    coalesce(u.is_banned, false),
    u.active_session_id
  into
    v_role,
    v_is_active,
    v_is_banned,
    v_active_session_id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if v_is_active is distinct from true then
    return 'anon';
  end if;

  if v_is_banned = true then
    return 'anon';
  end if;

  if public.is_auth_session_revoked(auth.uid(), public.current_auth_session_id()) then
    return 'anon';
  end if;

  if v_active_session_id is not null and v_active_session_id <> public.current_auth_session_id() then
    return 'anon';
  end if;

  return coalesce(v_role, 'user');
end;
$$;

create or replace function public.claim_active_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_previous_session_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_session_id is null then
    raise exception 'Gecerli bir session id zorunludur.';
  end if;

  if public.is_auth_session_revoked(v_auth_user_id, p_session_id) then
    raise exception 'Bu oturum guvenlik nedeniyle kapatildi.';
  end if;

  select u.active_session_id
  into v_previous_session_id
  from public.users u
  where u.auth_user_id = v_auth_user_id
  for update;

  update public.users
  set active_session_id = p_session_id,
      active_session_claimed_at = now()
  where auth_user_id = v_auth_user_id;

  if not found then
    raise exception 'Kullanici profili bulunamadi.';
  end if;

  if v_previous_session_id is distinct from p_session_id then
    insert into public.auth_session_events (auth_user_id, session_id, claimed_at, last_seen_at)
    values (v_auth_user_id, p_session_id, now(), now())
    on conflict (auth_user_id, session_id)
    do update
      set claimed_at = excluded.claimed_at,
          last_seen_at = excluded.last_seen_at;

    delete from public.auth_session_events
    where auth_user_id = v_auth_user_id
      and id in (
        select stale.id
        from public.auth_session_events stale
        where stale.auth_user_id = v_auth_user_id
        order by stale.claimed_at desc, stale.id desc
        offset 20
      );
  end if;
end;
$$;

revoke all on function public.claim_active_session(uuid) from public;
grant execute on function public.claim_active_session(uuid) to authenticated;

create or replace function public.record_auth_session_context(
  p_session_id uuid,
  p_device_id text default null,
  p_device_label text default null,
  p_platform text default null,
  p_browser text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_session_id is null then
    raise exception 'Gecerli bir session id zorunludur.';
  end if;

  insert into public.auth_session_events (
    auth_user_id,
    session_id,
    claimed_at,
    last_seen_at,
    device_id,
    device_label,
    platform,
    browser,
    user_agent
  )
  values (
    v_auth_user_id,
    p_session_id,
    now(),
    now(),
    nullif(trim(coalesce(p_device_id, '')), ''),
    nullif(trim(coalesce(p_device_label, '')), ''),
    nullif(trim(coalesce(p_platform, '')), ''),
    nullif(trim(coalesce(p_browser, '')), ''),
    nullif(trim(coalesce(p_user_agent, '')), '')
  )
  on conflict (auth_user_id, session_id)
  do update
    set last_seen_at = now(),
        device_id = coalesce(excluded.device_id, public.auth_session_events.device_id),
        device_label = coalesce(excluded.device_label, public.auth_session_events.device_label),
        platform = coalesce(excluded.platform, public.auth_session_events.platform),
        browser = coalesce(excluded.browser, public.auth_session_events.browser),
        user_agent = coalesce(excluded.user_agent, public.auth_session_events.user_agent);
end;
$$;

revoke all on function public.record_auth_session_context(uuid, text, text, text, text, text) from public;
grant execute on function public.record_auth_session_context(uuid, text, text, text, text, text) to authenticated;

create or replace function public.list_my_auth_sessions()
returns table (
  session_id uuid,
  claimed_at timestamptz,
  last_seen_at timestamptz,
  device_id text,
  device_label text,
  platform text,
  browser text,
  user_agent text,
  is_active boolean,
  is_revoked boolean,
  revoked_at timestamptz,
  revoke_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.session_id,
    e.claimed_at,
    e.last_seen_at,
    e.device_id,
    e.device_label,
    e.platform,
    e.browser,
    e.user_agent,
    (u.active_session_id = e.session_id and e.revoked_at is null) as is_active,
    (e.revoked_at is not null) as is_revoked,
    e.revoked_at,
    e.revoke_reason
  from public.auth_session_events e
  join public.users u
    on u.auth_user_id = auth.uid()
  where e.auth_user_id = auth.uid()
  order by
    (u.active_session_id = e.session_id and e.revoked_at is null) desc,
    e.claimed_at desc,
    e.id desc;
$$;

revoke all on function public.list_my_auth_sessions() from public;
grant execute on function public.list_my_auth_sessions() to authenticated;

create or replace function public.revoke_auth_session(
  p_session_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_active_session_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_session_id is null then
    raise exception 'Gecerli bir session id zorunludur.';
  end if;

  update public.auth_session_events
  set revoked_at = coalesce(revoked_at, now()),
      revoke_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), revoke_reason, 'Kullanici tarafindan kapatildi.')
  where auth_user_id = v_auth_user_id
    and session_id = p_session_id;

  if not found then
    raise exception 'Oturum kaydi bulunamadi.';
  end if;

  select active_session_id
  into v_active_session_id
  from public.users
  where auth_user_id = v_auth_user_id
  for update;

  if v_active_session_id = p_session_id then
    update public.users
    set active_session_id = gen_random_uuid(),
        active_session_claimed_at = now()
    where auth_user_id = v_auth_user_id;
  end if;
end;
$$;

revoke all on function public.revoke_auth_session(uuid, text) from public;
grant execute on function public.revoke_auth_session(uuid, text) to authenticated;

create or replace function public.prevent_non_admin_sensitive_user_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := public.current_public_user_id();
  v_context text := '';
  v_allow_sensitive boolean := false;
begin
  get diagnostics v_context = PG_CONTEXT;

  v_allow_sensitive := (
    v_context ~* 'function[[:space:]]+(public\.)?purchase_store_item[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_user_badge[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_fansub_badge[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?redeem_coin_code[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?claim_user_reward_task[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_fansub_store_item_with_user_wallet[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?set_user_ban_state[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?release_my_expired_ban[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?release_expired_bans[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?claim_active_session[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?revoke_auth_session[[:space:]]*\('
  );

  if public.is_admin() then
    return new;
  end if;

  if v_allow_sensitive then
    return new;
  end if;

  if v_caller_id is null then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;

  if old.id <> v_caller_id then
    raise exception 'Sadece kendi profilinizi guncelleyebilirsiniz.';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Rol alani degistirilemez.';
  end if;

  if new.is_banned is distinct from old.is_banned then
    raise exception 'Ban alani degistirilemez.';
  end if;

  if new.is_active is distinct from old.is_active then
    raise exception 'Aktiflik alani degistirilemez.';
  end if;

  if new.stones is distinct from old.stones then
    raise exception 'Bakiye alani degistirilemez.';
  end if;

  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Hesap baglantisi degistirilemez.';
  end if;

  if new.premium_expires_at is distinct from old.premium_expires_at then
    raise exception 'Premium suresi alani degistirilemez.';
  end if;

  if new.active_session_id is distinct from old.active_session_id then
    raise exception 'Aktif session alani degistirilemez.';
  end if;

  if new.active_session_claimed_at is distinct from old.active_session_claimed_at then
    raise exception 'Session claim zamani degistirilemez.';
  end if;

  return new;
end;
$$;

commit;
