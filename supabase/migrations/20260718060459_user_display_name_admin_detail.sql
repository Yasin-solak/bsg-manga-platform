-- Enriches the selected user and detail modal with the display name without copying the existing
-- heavy read model. The canonical username stays separately in the payload.

begin;

create or replace function public.get_admin_user_management_preview(
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_payload jsonb;
  v_display_name text;
begin
  v_payload := app_private.get_admin_user_management_preview(
    p_user_id,
    pg_catalog.statement_timestamp()
  );

  select coalesce(nullif(pg_catalog.btrim(u.display_name), ''), u.username)
  into v_display_name
  from public.users as u
  where u.id = p_user_id
  limit 1;

  return pg_catalog.jsonb_set(
    v_payload,
    '{profile,displayName}',
    pg_catalog.to_jsonb(coalesce(
      nullif(pg_catalog.btrim(v_display_name), ''),
      v_payload #>> '{profile,username}'
    )),
    true
  );
end;
$function$;

create or replace function public.get_admin_user_detail_v2(p_user_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_payload jsonb;
  v_display_name text;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Kullanici id zorunludur.';
  end if;

  v_payload := public.get_admin_user_detail(p_user_id);

  select coalesce(nullif(pg_catalog.btrim(u.display_name), ''), u.username)
  into v_display_name
  from public.users as u
  where u.id = p_user_id
  limit 1;

  return pg_catalog.jsonb_set(
    v_payload,
    '{profile,displayName}',
    pg_catalog.to_jsonb(coalesce(
      nullif(pg_catalog.btrim(v_display_name), ''),
      v_payload #>> '{profile,username}'
    )),
    true
  );
end;
$function$;

create or replace function app_private.get_admin_user_detail_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.users%rowtype;
begin
  if not app_private.is_admin() then
    raise exception using errcode = '42501', message = 'Bu islem icin admin yetkisi gerekir.';
  end if;

  select *
  into v_row
  from public.users as u
  where u.id = p_user_id
  limit 1;

  if not found then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'display_name', coalesce(nullif(pg_catalog.btrim(v_row.display_name), ''), v_row.username),
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
$function$;

create or replace function public.get_admin_user_detail_profile(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_admin_user_detail_profile(p_user_id);
$function$;

revoke all on function app_private.get_admin_user_detail_profile(uuid)
  from public, anon, authenticated;
grant execute on function app_private.get_admin_user_detail_profile(uuid)
  to authenticated;

revoke all on function public.get_admin_user_management_preview(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_user_management_preview(uuid)
  to authenticated, service_role;
revoke all on function public.get_admin_user_detail_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_user_detail_v2(uuid)
  to authenticated;
revoke all on function public.get_admin_user_detail_profile(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_user_detail_profile(uuid)
  to authenticated;

comment on function public.get_admin_user_detail_v2(uuid) is
  'Legacy detay read modelini displayName ile geriye uyumlu zenginlestirir; username canonical handle olarak korunur.';

notify pgrst, 'reload schema';
commit;
