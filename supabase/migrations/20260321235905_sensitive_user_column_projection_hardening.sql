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
    'auth_user_id', v_row.auth_user_id,
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
    'stones', v_row.stones,
    'owned_items', coalesce(v_row.owned_items, '{}'::jsonb),
    'premium_expires_at', v_row.premium_expires_at,
    'frame_type', v_row.frame_type,
    'active_badge_id', v_row.active_badge_id,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'onboarding_completed_at', v_row.onboarding_completed_at,
    'active_session_id', v_row.active_session_id,
    'active_session_claimed_at', v_row.active_session_claimed_at
  );
end;
$$;

create or replace function public.get_my_private_user_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_row public.users%rowtype;
begin
  if v_user_id is null then
    raise exception 'Aktif kullanici bulunamadi.';
  end if;

  select *
  into v_row
  from public.users
  where id = v_user_id
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'level', v_row.level,
    'frame_type', v_row.frame_type,
    'background_type', v_row.background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'social_links', coalesce(v_row.social_links, '[]'::jsonb),
    'owned_items', coalesce(v_row.owned_items, '{}'::jsonb),
    'stones', v_row.stones,
    'premium_expires_at', v_row.premium_expires_at,
    'onboarding_completed_at', v_row.onboarding_completed_at,
    'profile_visibility', v_row.profile_visibility,
    'stats_visibility', v_row.stats_visibility,
    'social_links_visibility', v_row.social_links_visibility,
    'activity_visibility', v_row.activity_visibility,
    'created_at', v_row.created_at
  );
end;
$$;

create or replace function public.get_admin_user_detail_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.users%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  select *
  into v_row
  from public.users
  where id = p_user_id
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'level', v_row.level,
    'social_links', coalesce(v_row.social_links, '[]'::jsonb),
    'role', v_row.role,
    'stones', v_row.stones,
    'frame_type', v_row.frame_type,
    'owned_items', coalesce(v_row.owned_items, '{}'::jsonb),
    'is_banned', v_row.is_banned,
    'is_active', v_row.is_active,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

grant execute on function public.get_auth_user_profile(uuid) to authenticated;
grant execute on function public.get_my_private_user_profile() to authenticated;
grant execute on function public.get_admin_user_detail_profile(uuid) to authenticated;

comment on function public.get_auth_user_profile(uuid)
  is 'Yalniz ilgili oturum sahibi veya admin icin kullanicinin hassas auth profil snapshotini dondurur.';

comment on function public.get_my_private_user_profile()
  is 'Aktif kullanicinin kendi profilini hassas alanlarla birlikte dondurur.';

comment on function public.get_admin_user_detail_profile(uuid)
  is 'Admin paneli fallback profili icin hedef kullanicinin hassas detaylarini dondurur.';

revoke select (stones, owned_items, active_session_id, active_session_claimed_at)
  on public.users
  from anon, authenticated;

commit;
