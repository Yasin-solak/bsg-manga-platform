begin;

create or replace function public.get_admin_user_directory_by_ids(p_user_ids uuid[])
returns table (
  id uuid,
  username text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  if coalesce(array_length(p_user_ids, 1), 0) = 0 then
    return;
  end if;

  return query
  select
    u.id,
    u.username,
    u.avatar_url
  from public.users u
  where u.id = any(p_user_ids);
end;
$$;

create or replace function public.find_admin_user_ids_by_username(
  p_search text,
  p_limit integer default 200
)
returns table (
  id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_safe_limit integer := greatest(1, least(coalesce(p_limit, 200), 200));
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  if v_search is null then
    return;
  end if;

  return query
  select u.id
  from public.users u
  where coalesce(u.username, '') ilike '%' || v_search || '%'
  order by u.username asc
  limit v_safe_limit;
end;
$$;

create or replace function public.get_admin_report_user_target(p_user_id uuid)
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

  if p_user_id is null then
    return null;
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
    'is_active', v_row.is_active,
    'is_banned', v_row.is_banned
  );
end;
$$;

grant execute on function public.get_admin_user_directory_by_ids(uuid[]) to authenticated;
grant execute on function public.find_admin_user_ids_by_username(text, integer) to authenticated;
grant execute on function public.get_admin_report_user_target(uuid) to authenticated;

comment on function public.get_admin_user_directory_by_ids(uuid[])
  is 'Admin yuzeylerinde id listesi icin dar kullanici dizini projectionini dondurur.';

comment on function public.find_admin_user_ids_by_username(text, integer)
  is 'Admin arama akislari icin kullanici adina gore id listesi dondurur.';

comment on function public.get_admin_report_user_target(uuid)
  is 'Admin rapor inceleme ekraninda hedef kullanicinin dar profil ve durum ozetini dondurur.';

commit;
