begin;

create or replace function public.get_public_user_profile_by_id(
  p_user_id uuid,
  p_include_social_links boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.users%rowtype;
  v_access record;
  v_can_view_social_links boolean := false;
begin
  if p_user_id is null then
    return null;
  end if;

  select *
  into v_row
  from public.users
  where id = p_user_id
    and coalesce(is_active, true) = true
    and coalesce(is_banned, false) = false
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into v_access
  from public.get_profile_view_access(v_row.id)
  limit 1;

  if coalesce(v_access.profile_visible, false) = false then
    return null;
  end if;

  if p_include_social_links then
    v_can_view_social_links := coalesce(v_access.social_links_visible, false);
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
    'social_links', case
      when v_can_view_social_links then coalesce(v_row.social_links, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'created_at', v_row.created_at
  );
end;
$$;

create or replace function public.get_public_user_profile_by_username(
  p_username text,
  p_include_social_links boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized_username text := nullif(btrim(coalesce(p_username, '')), '');
  v_row public.users%rowtype;
  v_access record;
  v_can_view_social_links boolean := false;
begin
  if v_normalized_username is null then
    return null;
  end if;

  select *
  into v_row
  from public.users
  where username = v_normalized_username
    and coalesce(is_active, true) = true
    and coalesce(is_banned, false) = false
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into v_access
  from public.get_profile_view_access(v_row.id)
  limit 1;

  if coalesce(v_access.profile_visible, false) = false then
    return null;
  end if;

  if p_include_social_links then
    v_can_view_social_links := coalesce(v_access.social_links_visible, false);
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
    'social_links', case
      when v_can_view_social_links then coalesce(v_row.social_links, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'created_at', v_row.created_at
  );
end;
$$;

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
    'ban_until', v_row.ban_until,
    'is_active', v_row.is_active,
    'onboarding_completed_at', v_row.onboarding_completed_at
  );
end;
$$;

comment on function public.get_public_user_profile_by_id(uuid, boolean)
  is 'Public profil payloadi premium bitis tarihi gibi finansal sinyal tasimaz; sosyal linkler DB tarafinda gorunurluk kontroluyle eklenir.';

comment on function public.get_public_user_profile_by_username(text, boolean)
  is 'Kullanici adiyla public profil payloadini premium ve benzeri hassas self alanlari olmadan dondurur.';

comment on function public.get_auth_user_profile(uuid)
  is 'Auth bootstrap profili; role, banli mi ve aktif mi gibi guard alanlarini tasir ama ban nedeni ve benzeri hassas detaylari tarayiciya tasimaz.';

commit;
