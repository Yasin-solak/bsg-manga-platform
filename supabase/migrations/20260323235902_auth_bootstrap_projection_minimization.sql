begin;

create or replace function public.get_auth_user_profile(p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if auth.uid() <> p_auth_user_id and not public.is_admin() then
    raise exception 'Bu profil verisine erisim yetkiniz yok.';
  end if;

  select *
  into v_row
  from public.users
  where auth_user_id = p_auth_user_id
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'username_slug', v_row.username_slug,
    'avatar_url', v_row.avatar_url,
    'role', v_row.role,
    'is_banned', v_row.is_banned,
    'ban_reason', v_row.ban_reason,
    'ban_until', v_row.ban_until,
    'banned_by', v_row.banned_by,
    'banned_at', v_row.banned_at,
    'is_active', v_row.is_active,
    'onboarding_completed_at', v_row.onboarding_completed_at
  );
end;
$$;

create or replace function public.get_my_account_runtime_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_row
  from public.users
  where auth_user_id = auth.uid()
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'stones', v_row.stones,
    'owned_items', coalesce(v_row.owned_items, '{}'::jsonb),
    'premium_expires_at', v_row.premium_expires_at,
    'frame_type', v_row.frame_type,
    'active_badge_id', v_row.active_badge_id,
    'active_profile_effect_id', v_row.active_profile_effect_id
  );
end;
$$;

grant execute on function public.get_auth_user_profile(uuid) to authenticated;
grant execute on function public.get_my_account_runtime_snapshot() to authenticated;

comment on function public.get_auth_user_profile(uuid)
  is 'Auth bootstrap profili; kimlik ve oturum guard icin gerekli dar snapshoti dondurur. auth_user_id ve kozmetik/runtime alanlari ayri self snapshot uzerinden okunur.';

comment on function public.get_my_account_runtime_snapshot()
  is 'Aktif kullanicinin ekonomi ve runtime kozmetik snapshotini dondurur; auth bootstrap payloadini sisirmez.';

commit;
