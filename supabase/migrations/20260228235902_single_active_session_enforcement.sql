-- ============================================
-- BSG Manga | Single active session enforcement
-- Date: 2026-02-28
-- ============================================

begin;

alter table public.users
  add column if not exists active_session_id uuid,
  add column if not exists active_session_claimed_at timestamptz;

create index if not exists users_active_session_id_idx
  on public.users (active_session_id);

create or replace function public.current_auth_session_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session_id text;
begin
  v_session_id := nullif(auth.jwt()->>'session_id', '');
  if v_session_id is null then
    return null;
  end if;

  begin
    return v_session_id::uuid;
  exception
    when others then
      return null;
  end;
end;
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
begin
  if v_auth_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_session_id is null then
    raise exception 'Gecerli bir session id zorunludur.';
  end if;

  update public.users
  set active_session_id = p_session_id,
      active_session_claimed_at = now()
  where auth_user_id = v_auth_user_id;

  if not found then
    raise exception 'Kullanici profili bulunamadi.';
  end if;
end;
$$;

revoke all on function public.claim_active_session(uuid) from public;
grant execute on function public.claim_active_session(uuid) to authenticated;

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
