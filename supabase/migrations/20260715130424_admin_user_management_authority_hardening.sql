-- Keeps users UPDATE permission default-closed; opens only direct profile fields.
-- Session close and admin ban flows follow the same user -> session lock order.

begin;

create schema if not exists app_private;
grant usage on schema app_private to authenticated, service_role;

revoke update on table public.users from public, anon, authenticated;

do $authority_grants$
declare
  v_all_columns text;
begin
  select pg_catalog.string_agg(
    pg_catalog.format('%I', c.column_name),
    ', ' order by c.ordinal_position
  )
  into v_all_columns
  from information_schema.columns as c
  where c.table_schema = 'public'
    and c.table_name = 'users';

  if v_all_columns is null then
    raise exception using
      errcode = '55000',
      message = 'public.users kolonlari bulunamadi.';
  end if;

  execute pg_catalog.format(
    'revoke update (%s) on table public.users from public, anon, authenticated',
    v_all_columns
  );
end;
$authority_grants$;

grant update on table public.users to service_role;
grant update (
  avatar_url,
  bio,
  social_links,
  preferred_genres
) on table public.users to authenticated;

create or replace function app_private.revoke_auth_session(
  p_session_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_active_session_id uuid;
  v_as_of timestamptz := pg_catalog.statement_timestamp();
begin
  if v_auth_user_id is null then
    raise exception using errcode = '42501', message = 'Bu islem icin giris yapmalisiniz.';
  end if;
  if p_session_id is null then
    raise exception using errcode = '22023', message = 'Gecerli bir session id zorunludur.';
  end if;

  select u.active_session_id
  into v_active_session_id
  from public.users as u
  where u.auth_user_id = v_auth_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Kullanici profili bulunamadi.';
  end if;

  update public.auth_session_events as e
  set
    revoked_at = coalesce(e.revoked_at, v_as_of),
    revoke_reason = coalesce(
      nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_reason, '')), 500), ''),
      e.revoke_reason,
      'Kullanici tarafindan kapatildi.'
    )
  where e.auth_user_id = v_auth_user_id
    and e.session_id = p_session_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Oturum kaydi bulunamadi.';
  end if;

  if v_active_session_id = p_session_id then
    perform pg_catalog.set_config('app.claim_active_session_update', 'true', true);

    update public.users as u
    set
      active_session_id = extensions.gen_random_uuid(),
      active_session_claimed_at = v_as_of,
      updated_at = v_as_of
    where u.auth_user_id = v_auth_user_id;

    perform pg_catalog.set_config('app.claim_active_session_update', '', true);
  end if;
end;
$function$;

create or replace function public.revoke_auth_session(
  p_session_id uuid,
  p_reason text default null
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select app_private.revoke_auth_session(p_session_id, p_reason);
$function$;

revoke all on function app_private.revoke_auth_session(uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.revoke_auth_session(uuid, text)
  to authenticated;
revoke all on function public.revoke_auth_session(uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_auth_session(uuid, text)
  to authenticated;

comment on function public.revoke_auth_session(uuid, text) is
  'Kullanici ve session satirlarini sabit user -> session sirasiyla kilitleyen oturum kapatma RPCsi.';

notify pgrst, 'reload schema';
commit;
