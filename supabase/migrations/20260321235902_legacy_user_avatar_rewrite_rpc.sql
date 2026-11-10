-- The legacy user avatar rewrite flow gives service_role, during the R2 backfill,
-- a narrow bypass only for the avatar_url rewrite.

begin;

create or replace function public.rewrite_legacy_user_avatar_url(
  p_user_id uuid,
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avatar_url text := nullif(trim(coalesce(p_avatar_url, '')), '');
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;

  if p_user_id is null then
    raise exception 'Kullanici id zorunludur.';
  end if;

  if v_avatar_url is null then
    raise exception 'Avatar URL zorunludur.';
  end if;

  update public.users
  set avatar_url = v_avatar_url
  where id = p_user_id;

  if not found then
    raise exception 'Kullanici bulunamadi.';
  end if;
end;
$$;

grant execute on function public.rewrite_legacy_user_avatar_url(uuid, text) to authenticated, service_role;

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
    or v_context ~* 'function[[:space:]]+(public\.)?donate_to_fansub[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?rewrite_legacy_user_avatar_url[[:space:]]*\('
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
