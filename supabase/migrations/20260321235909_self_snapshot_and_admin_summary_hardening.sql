begin;

create or replace function public.get_my_profile_customization_snapshot()
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
    'frame_type', v_row.frame_type,
    'background_type', v_row.background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'onboarding_completed_at', v_row.onboarding_completed_at
  );
end;
$$;

create or replace function public.mark_my_onboarding_completed(
  p_completed_at timestamptz default now()
)
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

  update public.users
  set onboarding_completed_at = coalesce(p_completed_at, now())
  where id = v_user_id
  returning *
  into v_row;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'onboarding_completed_at', v_row.onboarding_completed_at
  );
end;
$$;

create or replace function public.get_admin_user_overview_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  select jsonb_build_object(
    'total', count(*)::int,
    'active', count(*) filter (where coalesce(is_active, true) = true and coalesce(is_banned, false) = false)::int,
    'banned', count(*) filter (where coalesce(is_banned, false) = true)::int,
    'admins', count(*) filter (where role = 'admin')::int,
    'moderators', count(*) filter (where role = 'moderator')::int
  )
  into v_result
  from public.users;

  return coalesce(
    v_result,
    jsonb_build_object(
      'total', 0,
      'active', 0,
      'banned', 0,
      'admins', 0,
      'moderators', 0
    )
  );
end;
$$;

create or replace function public.get_admin_recent_users(
  p_limit integer default 50
)
returns table (
  id uuid,
  username text,
  avatar_url text,
  role text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_safe_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  return query
  select
    u.id,
    u.username,
    u.avatar_url,
    u.role::text,
    u.created_at,
    u.updated_at
  from public.users u
  order by u.created_at desc
  limit v_safe_limit;
end;
$$;

create or replace function public.get_admin_store_item_user_owners(
  p_item_identifier text,
  p_item_type text,
  p_limit integer default 80
)
returns table (
  id uuid,
  username text,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_identifier text := nullif(btrim(coalesce(p_item_identifier, '')), '');
  v_item_type text := lower(nullif(btrim(coalesce(p_item_type, '')), ''));
  v_owned_items_key text;
  v_safe_limit integer := greatest(1, least(coalesce(p_limit, 80), 200));
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  if v_item_identifier is null or v_item_type is null then
    return;
  end if;

  v_owned_items_key := case v_item_type
    when 'frame' then 'frames'
    when 'background' then 'backgrounds'
    when 'pattern' then 'patterns'
    when 'badge' then 'badges'
    when 'profile_effect' then 'profile_effects'
    when 'premium' then 'premium'
    else null
  end;

  if v_owned_items_key is null then
    return;
  end if;

  return query
  with matched as (
    select
      u.id,
      coalesce(u.username, 'Kullanici') as username,
      u.updated_at,
      count(*) over() as total_count
    from public.users u
    where coalesce(u.owned_items -> v_owned_items_key, '[]'::jsonb) @> jsonb_build_array(v_item_identifier)
    order by u.updated_at desc
    limit v_safe_limit
  )
  select
    matched.id,
    matched.username,
    matched.updated_at,
    matched.total_count
  from matched;
end;
$$;

grant execute on function public.get_my_profile_customization_snapshot() to authenticated;
grant execute on function public.mark_my_onboarding_completed(timestamptz) to authenticated;
grant execute on function public.get_admin_user_overview_counts() to authenticated;
grant execute on function public.get_admin_recent_users(integer) to authenticated;
grant execute on function public.get_admin_store_item_user_owners(text, text, integer) to authenticated;

comment on function public.get_my_profile_customization_snapshot()
  is 'Aktif kullanicinin sidebar ve benzeri self-only akislar icin dar profil ozellestirme snapshotini dondurur.';

comment on function public.mark_my_onboarding_completed(timestamptz)
  is 'Aktif kullanicinin onboarding tamamlanma zamanini self-service ve dar payload ile gunceller.';

comment on function public.get_admin_user_overview_counts()
  is 'Admin kullanici ozet sayaclarini tek RPC cevabinda dondurur.';

comment on function public.get_admin_recent_users(integer)
  is 'Dashboard ve benzeri dar admin yuzeyleri icin son kullanicilari listeleyen purpose-built RPC.';

comment on function public.get_admin_store_item_user_owners(text, text, integer)
  is 'Admin store satis detay ekraninda store item sahiplerini owned_items filtresini DB tarafinda uygulayarak dondurur.';

commit;
