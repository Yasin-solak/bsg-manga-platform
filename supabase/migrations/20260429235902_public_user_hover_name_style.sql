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
  v_is_premium_active boolean := false;
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

  v_is_premium_active := v_row.premium_expires_at is not null and v_row.premium_expires_at > now();

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'level', v_row.level,
    'frame_type', v_row.frame_type,
    'background_type', v_row.background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'active_fansub_identity_tag', public.resolve_user_active_fansub_identity_tag(v_row.id),
    'is_premium_active', v_is_premium_active,
    'active_name_style', case
      when v_is_premium_active then v_row.owned_items -> 'active_name_style'
      else null
    end,
    'active_name_effect', case
      when v_is_premium_active then v_row.owned_items ->> 'active_name_effect'
      else null
    end,
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
  v_is_premium_active boolean := false;
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

  v_is_premium_active := v_row.premium_expires_at is not null and v_row.premium_expires_at > now();

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'level', v_row.level,
    'frame_type', v_row.frame_type,
    'background_type', v_row.background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'active_fansub_identity_tag', public.resolve_user_active_fansub_identity_tag(v_row.id),
    'is_premium_active', v_is_premium_active,
    'active_name_style', case
      when v_is_premium_active then v_row.owned_items -> 'active_name_style'
      else null
    end,
    'active_name_effect', case
      when v_is_premium_active then v_row.owned_items ->> 'active_name_effect'
      else null
    end,
    'social_links', case
      when v_can_view_social_links then coalesce(v_row.social_links, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'created_at', v_row.created_at
  );
end;
$$;

grant execute on function public.get_public_user_profile_by_id(uuid, boolean) to anon, authenticated;
grant execute on function public.get_public_user_profile_by_username(text, boolean) to anon, authenticated;

comment on function public.get_public_user_profile_by_id(uuid, boolean)
  is 'Public profil projeksiyonu. Hover karti icin premium isim stilini guvenli secilmis alanlarla dondurur.';

comment on function public.get_public_user_profile_by_username(text, boolean)
  is 'Public profil projeksiyonu. Hover karti icin premium isim stilini guvenli secilmis alanlarla dondurur.';

commit;
