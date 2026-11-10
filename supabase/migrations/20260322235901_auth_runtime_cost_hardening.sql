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
    'onboarding_completed_at', v_row.onboarding_completed_at
  );
end;
$$;

create or replace function public.get_my_session_guard_state(p_session_id uuid)
returns text
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

  if not found or v_row.active_session_id is null then
    return 'missing';
  end if;

  if v_row.active_session_id = p_session_id then
    return 'match';
  end if;

  return 'replaced';
end;
$$;

create or replace function public.list_my_community_post_like_states(p_post_ids uuid[])
returns table (
  post_id uuid,
  liked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
begin
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  return query
  with requested as (
    select distinct unnest(coalesce(p_post_ids, '{}'::uuid[])) as requested_post_id
  )
  select
    requested.requested_post_id as post_id,
    exists (
      select 1
      from public.community_post_likes cpl
      where cpl.post_id = requested.requested_post_id
        and cpl.user_id = v_user_id
    ) as liked
  from requested;
end;
$$;

create or replace function public.get_popular_community_tags(
  p_limit integer default 5,
  p_window_days integer default 30
)
returns table (
  tag text,
  count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_safe_limit integer := greatest(1, least(coalesce(p_limit, 5), 10));
  v_safe_window_days integer := greatest(1, least(coalesce(p_window_days, 30), 365));
begin
  return query
  with flattened as (
    select
      left(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(btrim(raw_tag)), '^#+', ''),
            '\s+',
            '-',
            'g'
          ),
          '[^[:alnum:]_-]+',
          '',
          'g'
        ),
        30
      ) as normalized_tag
    from public.community_posts cp
    cross join lateral unnest(coalesce(cp.tags, '{}'::text[])) as raw(raw_tag)
    where cp.status = 'approved'
      and cp.is_active = true
      and (cp.category is null or cp.category <> 'Duyuru')
      and cp.created_at >= now() - make_interval(days => v_safe_window_days)
  )
  select
    flattened.normalized_tag as tag,
    count(*)::bigint as count
  from flattened
  where flattened.normalized_tag <> ''
  group by flattened.normalized_tag
  order by count(*) desc, flattened.normalized_tag asc
  limit v_safe_limit;
end;
$$;

grant execute on function public.get_auth_user_profile(uuid) to authenticated;
grant execute on function public.get_my_session_guard_state(uuid) to authenticated;
grant execute on function public.list_my_community_post_like_states(uuid[]) to authenticated;
grant execute on function public.get_popular_community_tags(integer, integer) to anon, authenticated;

comment on function public.get_auth_user_profile(uuid)
  is 'Auth bootstrap profili; aktif session id gibi tek-oturum alanlarini istemciye tasimadan self/admin icin dar kullanici snapshoti dondurur.';

comment on function public.get_my_session_guard_state(uuid)
  is 'Aktif JWT session_id icin yalniz match/missing/replaced durumu dondurur; aktif session id degerini istemciye acmaz.';

comment on function public.list_my_community_post_like_states(uuid[])
  is 'Aktif kullanicinin topluluk post begeni durumlarini batch olarak dondurur; liste ekranlarinda N+1 like kontrolunu kapatir.';

comment on function public.get_popular_community_tags(integer, integer)
  is 'Topluluk populer etiketlerini DB tarafinda aggregate ederek istemciye sadece limitli sonuc dondurur.';

commit;
