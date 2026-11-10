begin;

alter table public.users
  add column if not exists profile_visibility text not null default 'public'
    check (profile_visibility in ('public', 'followers', 'private')),
  add column if not exists stats_visibility text not null default 'public'
    check (stats_visibility in ('public', 'followers', 'private')),
  add column if not exists social_links_visibility text not null default 'public'
    check (social_links_visibility in ('public', 'followers', 'private')),
  add column if not exists activity_visibility text not null default 'public'
    check (activity_visibility in ('public', 'followers', 'private'));

create or replace function public.normalize_profile_visibility(p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_value in ('public', 'followers', 'private') then
    return p_value;
  end if;

  raise exception 'Gecersiz gorunurluk degeri: %', p_value;
end;
$$;

create or replace function public.update_my_profile_privacy_settings(
  p_profile_visibility text,
  p_stats_visibility text,
  p_social_links_visibility text,
  p_activity_visibility text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_payload jsonb;
begin
  if v_user_id is null then
    raise exception 'Aktif kullanici bulunamadi.';
  end if;

  update public.users
  set profile_visibility = public.normalize_profile_visibility(p_profile_visibility),
      stats_visibility = public.normalize_profile_visibility(p_stats_visibility),
      social_links_visibility = public.normalize_profile_visibility(p_social_links_visibility),
      activity_visibility = public.normalize_profile_visibility(p_activity_visibility),
      updated_at = now()
  where id = v_user_id
  returning jsonb_build_object(
    'profile_visibility', profile_visibility,
    'stats_visibility', stats_visibility,
    'social_links_visibility', social_links_visibility,
    'activity_visibility', activity_visibility
  )
  into v_payload;

  if v_payload is null then
    raise exception 'Gizlilik ayarlari guncellenemedi.';
  end if;

  return v_payload;
end;
$$;

create or replace function public.get_profile_view_access(p_target_user_id uuid)
returns table (
  is_owner boolean,
  viewer_is_follower boolean,
  profile_visible boolean,
  stats_visible boolean,
  social_links_visible boolean,
  activity_visible boolean,
  profile_visibility text,
  stats_visibility text,
  social_links_visibility text,
  activity_visibility text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := public.current_public_user_id();
  v_profile_visibility text;
  v_stats_visibility text;
  v_social_links_visibility text;
  v_activity_visibility text;
  v_is_owner boolean := false;
  v_viewer_is_follower boolean := false;
begin
  select
    coalesce(u.profile_visibility, 'public'),
    coalesce(u.stats_visibility, 'public'),
    coalesce(u.social_links_visibility, 'public'),
    coalesce(u.activity_visibility, 'public')
  into
    v_profile_visibility,
    v_stats_visibility,
    v_social_links_visibility,
    v_activity_visibility
  from public.users u
  where u.id = p_target_user_id
    and coalesce(u.is_active, true) = true
    and coalesce(u.is_banned, false) = false
  limit 1;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_viewer_id is not null then
    v_is_owner := v_viewer_id = p_target_user_id;

    if public.is_user_blocked_between(v_viewer_id, p_target_user_id) then
      return query
      select
        v_is_owner,
        false,
        false,
        false,
        false,
        false,
        v_profile_visibility,
        v_stats_visibility,
        v_social_links_visibility,
        v_activity_visibility;
      return;
    end if;

    if not v_is_owner then
      select exists(
        select 1
        from public.user_follows uf
        where uf.follower_id = v_viewer_id
          and uf.following_id = p_target_user_id
      )
      into v_viewer_is_follower;
    end if;
  end if;

  return query
  select
    v_is_owner,
    v_viewer_is_follower,
    case
      when v_is_owner then true
      when v_profile_visibility = 'public' then true
      when v_profile_visibility = 'followers' then v_viewer_is_follower
      else false
    end,
    case
      when v_is_owner then true
      when v_stats_visibility = 'public' then true
      when v_stats_visibility = 'followers' then v_viewer_is_follower
      else false
    end,
    case
      when v_is_owner then true
      when v_social_links_visibility = 'public' then true
      when v_social_links_visibility = 'followers' then v_viewer_is_follower
      else false
    end,
    case
      when v_is_owner then true
      when v_activity_visibility = 'public' then true
      when v_activity_visibility = 'followers' then v_viewer_is_follower
      else false
    end,
    v_profile_visibility,
    v_stats_visibility,
    v_social_links_visibility,
    v_activity_visibility;
end;
$$;

grant execute on function public.update_my_profile_privacy_settings(text, text, text, text) to authenticated;
grant execute on function public.get_profile_view_access(uuid) to authenticated, anon;

comment on function public.update_my_profile_privacy_settings(text, text, text, text)
  is 'Kullanicinin kendi gizlilik ayarlarini dogrulanmis visibility degerleriyle gunceller.';

comment on function public.get_profile_view_access(uuid)
  is 'Hedef profil icin mevcut izleyicinin hangi alanlari gorebilecegini hesaplar.';

commit;
