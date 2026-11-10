-- Serializes user ban and role mutations under the same authority lock.
-- Bulk ban returns per-target results; an unexpected error rolls back the whole statement.

begin;

create schema if not exists app_private;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.set_admin_users_ban_state(
  p_user_ids uuid[],
  p_is_banned boolean,
  p_reason text,
  p_ban_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := app_private.current_public_user_id();
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_user_ids uuid[] := '{}'::uuid[];
  v_update_ids uuid[] := '{}'::uuid[];
  v_allowed_admin_ids uuid[] := '{}'::uuid[];
  v_available_admins integer := 0;
  v_allowed_admin_bans integer := 0;
  v_as_of timestamptz := pg_catalog.statement_timestamp();
  v_result jsonb;
begin
  if not coalesce(app_private.is_admin(), false) or v_actor_id is null then
    raise exception using errcode = '42501', message = 'Bu islem icin admin yetkisi gerekir.';
  end if;
  if p_is_banned is null then
    raise exception using errcode = '22023', message = 'Ban durumu zorunludur.';
  end if;

  select coalesce(pg_catalog.array_agg(input.user_id order by input.user_id), '{}'::uuid[])
  into v_user_ids
  from (
    select distinct raw.user_id
    from pg_catalog.unnest(coalesce(p_user_ids, '{}'::uuid[])) as raw(user_id)
    where raw.user_id is not null
  ) as input;

  if pg_catalog.cardinality(v_user_ids) < 1 then
    raise exception using errcode = '22023', message = 'En az bir kullanici secilmelidir.';
  end if;
  if pg_catalog.cardinality(v_user_ids) > 100 then
    raise exception using errcode = '22023', message = 'Tek istekte en fazla 100 kullanici islenebilir.';
  end if;
  if p_is_banned and (v_reason is null or pg_catalog.char_length(v_reason) < 3) then
    raise exception using errcode = '22023', message = 'Ban nedeni en az 3 karakter olmalidir.';
  end if;
  if p_is_banned and pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'Ban nedeni en fazla 500 karakter olabilir.';
  end if;
  if p_is_banned and p_ban_until is not null and p_ban_until <= v_as_of then
    raise exception using errcode = '22023', message = 'Ban bitis zamani gelecekte olmalidir.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bsgmanga:admin-authority-mutation', 0)
  );

  perform u.id
  from public.users as u
  where u.id = v_actor_id
     or u.id = any(v_user_ids)
  order by u.id
  for update;

  if app_private.current_public_user_id() is distinct from v_actor_id
     or not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Admin yetkisi islem sirasinda degisti.';
  end if;

  select pg_catalog.count(*)::integer
  into v_available_admins
  from public.users as u
  where u.role = 'admin'
    and coalesce(u.is_active, true) = true
    and not (
      coalesce(u.is_banned, false)
      and (u.ban_until is null or u.ban_until > v_as_of)
    );

  v_allowed_admin_bans := greatest(v_available_admins - 1, 0);

  select coalesce(pg_catalog.array_agg(candidate.id order by candidate.id), '{}'::uuid[])
  into v_allowed_admin_ids
  from (
    select u.id
    from public.users as u
    where u.id = any(v_user_ids)
      and u.id <> v_actor_id
      and u.role = 'admin'
      and coalesce(u.is_active, true) = true
      and not (
        coalesce(u.is_banned, false)
        and (u.ban_until is null or u.ban_until > v_as_of)
      )
    order by u.id
    limit v_allowed_admin_bans
  ) as candidate;

  select coalesce(pg_catalog.array_agg(candidate.id order by candidate.id), '{}'::uuid[])
  into v_update_ids
  from (
    select u.id
    from public.users as u
    where u.id = any(v_user_ids)
      and (
        not p_is_banned
        or u.id <> v_actor_id
      )
      and (
        not p_is_banned
        or u.role <> 'admin'
        or coalesce(u.is_active, true) = false
        or (
          coalesce(u.is_banned, false)
          and (u.ban_until is null or u.ban_until > v_as_of)
        )
        or u.id = any(v_allowed_admin_ids)
      )
      and (
        coalesce(u.is_banned, false)
        and (u.ban_until is null or u.ban_until > v_as_of)
      ) is distinct from p_is_banned
    order by u.id
  ) as candidate;

  update public.users as u
  set
    is_banned = p_is_banned,
    ban_reason = case when p_is_banned then v_reason else null end,
    ban_until = case when p_is_banned then p_ban_until else null end,
    banned_by = case when p_is_banned then v_actor_id else null end,
    banned_at = case when p_is_banned then v_as_of else null end,
    active_session_id = case
      when p_is_banned then extensions.gen_random_uuid()
      else u.active_session_id
    end,
    active_session_claimed_at = case
      when p_is_banned then v_as_of
      else u.active_session_claimed_at
    end,
    updated_at = v_as_of
  where u.id = any(v_update_ids);

  if p_is_banned and pg_catalog.cardinality(v_update_ids) > 0 then
    update public.auth_session_events as e
    set
      revoked_at = coalesce(e.revoked_at, v_as_of),
      revoke_reason = coalesce(
        e.revoke_reason,
        pg_catalog.left('Admin bani: ' || v_reason, 500)
      )
    from public.users as u
    where u.id = any(v_update_ids)
      and e.auth_user_id = u.auth_user_id
      and e.revoked_at is null;
  end if;

  if pg_catalog.cardinality(v_update_ids) > 0 then
    insert into public.security_events (
      source,
      event_type,
      severity,
      message,
      metadata,
      actor_user_id,
      target_user_id,
      created_at
    )
    select
      'admin',
      case when p_is_banned then 'user_banned' else 'user_unbanned' end,
      case when p_is_banned then 'high' else 'medium' end,
      case when p_is_banned then v_reason else 'Kullanici bani kaldirildi.' end,
      pg_catalog.jsonb_build_object(
        'bulk', true,
        'banUntil', case when p_is_banned then p_ban_until else null end
      ),
      v_actor_id,
      changed.user_id,
      v_as_of
    from pg_catalog.unnest(v_update_ids) as changed(user_id);
  end if;

  with statuses as materialized (
    select
      requested.user_id,
      case
        when u.id is null then 'not_found'
        when p_is_banned and requested.user_id = v_actor_id then 'self_rejected'
        when p_is_banned
          and u.role = 'admin'
          and coalesce(u.is_active, true) = true
          and not (
            coalesce(u.is_banned, false)
            and (u.ban_until is null or u.ban_until > v_as_of)
          )
          and not (u.id = any(v_allowed_admin_ids))
          then 'last_admin_rejected'
        when u.id = any(v_update_ids) then 'updated'
        when (
          coalesce(u.is_banned, false)
          and (u.ban_until is null or u.ban_until > v_as_of)
        ) = p_is_banned then 'unchanged'
        else 'unchanged'
      end as status
    from pg_catalog.unnest(v_user_ids) as requested(user_id)
    left join public.users as u on u.id = requested.user_id
  )
  select pg_catalog.jsonb_build_object(
    'requested', pg_catalog.count(*)::integer,
    'updated', pg_catalog.count(*) filter (where s.status = 'updated')::integer,
    'unchanged', pg_catalog.count(*) filter (where s.status = 'unchanged')::integer,
    'rejected', pg_catalog.count(*) filter (
      where s.status not in ('updated', 'unchanged')
    )::integer,
    'items', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'userId', s.user_id,
          'status', s.status
        ) order by s.user_id
      ),
      '[]'::jsonb
    )
  ) into v_result
  from statuses as s;

  begin
    perform public.create_admin_audit_log(
      case when p_is_banned then 'user.bulk_ban' else 'user.bulk_unban' end,
      'user',
      null,
      case
        when p_is_banned then 'Toplu kullanici bani uygulandi.'
        else 'Toplu kullanici bani kaldirildi.'
      end,
      pg_catalog.jsonb_build_object(
        'requested', v_result -> 'requested',
        'updated', v_result -> 'updated',
        'rejected', v_result -> 'rejected',
        'banUntil', case when p_is_banned then p_ban_until else null end
      )
    );
  exception when others then
    null;
  end;

  return v_result;
end;
$function$;

create or replace function public.set_admin_users_ban_state(
  p_user_ids uuid[],
  p_is_banned boolean,
  p_reason text default null,
  p_ban_until timestamptz default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select app_private.set_admin_users_ban_state(
    p_user_ids,
    p_is_banned,
    p_reason,
    p_ban_until
  );
$function$;

create or replace function app_private.set_user_ban_state(
  p_user_id uuid,
  p_is_banned boolean,
  p_ban_reason text default null,
  p_ban_until timestamptz default null
)
returns table (
  id uuid,
  is_banned boolean,
  ban_reason text,
  ban_until timestamptz,
  banned_by uuid,
  banned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_status text;
begin
  v_result := app_private.set_admin_users_ban_state(
    array[p_user_id],
    p_is_banned,
    p_ban_reason,
    p_ban_until
  );
  v_status := v_result #>> '{items,0,status}';

  if v_status = 'not_found' then
    raise exception using errcode = 'P0002', message = 'Kullanici bulunamadi.';
  elsif v_status = 'self_rejected' then
    raise exception using errcode = '42501', message = 'Kendi hesabini banlayamazsin.';
  elsif v_status = 'last_admin_rejected' then
    raise exception using errcode = '42501', message = 'Son kullanilabilir admin banlanamaz.';
  elsif v_status not in ('updated', 'unchanged') then
    raise exception using errcode = '42501', message = 'Ban durumu degistirilemedi.';
  end if;

  return query
  select
    u.id,
    coalesce(u.is_banned, false),
    u.ban_reason,
    u.ban_until,
    u.banned_by,
    u.banned_at
  from public.users as u
  where u.id = p_user_id;
end;
$function$;

create or replace function public.set_user_ban_state(
  p_user_id uuid,
  p_is_banned boolean,
  p_ban_reason text default null,
  p_ban_until timestamptz default null
)
returns table (
  id uuid,
  is_banned boolean,
  ban_reason text,
  ban_until timestamptz,
  banned_by uuid,
  banned_at timestamptz
)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from app_private.set_user_ban_state(
    p_user_id,
    p_is_banned,
    p_ban_reason,
    p_ban_until
  );
$function$;

create or replace function app_private.set_user_role(
  p_user_id uuid,
  p_role text
)
returns table (
  id uuid,
  role text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := app_private.current_public_user_id();
  v_next_role text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_role, '')));
  v_previous_role text;
  v_target_username text;
  v_remaining_available_admins integer;
  v_as_of timestamptz := pg_catalog.statement_timestamp();
begin
  if not coalesce(app_private.is_admin(), false) or v_actor_id is null then
    raise exception using errcode = '42501', message = 'Bu islem icin admin yetkisi gerekir.';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Kullanici zorunludur.';
  end if;
  if v_next_role not in ('user', 'moderator', 'admin') then
    raise exception using errcode = '22023', message = 'Gecersiz rol secimi.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bsgmanga:admin-authority-mutation', 0)
  );

  perform u.id
  from public.users as u
  where u.id = v_actor_id
     or u.id = p_user_id
  order by u.id
  for update;

  if app_private.current_public_user_id() is distinct from v_actor_id
     or not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Admin yetkisi islem sirasinda degisti.';
  end if;

  select u.role, u.username
  into v_previous_role, v_target_username
  from public.users as u
  where u.id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Kullanici bulunamadi.';
  end if;

  v_previous_role := coalesce(v_previous_role, 'user');
  if p_user_id = v_actor_id and v_next_role <> 'admin' then
    raise exception using errcode = '42501', message = 'Kendi admin rolunu dusuremezsin.';
  end if;

  if v_previous_role = 'admin' and v_next_role <> 'admin' then
    select pg_catalog.count(*)::integer
    into v_remaining_available_admins
    from public.users as u
    where u.id <> p_user_id
      and u.role = 'admin'
      and coalesce(u.is_active, true) = true
      and not (
        coalesce(u.is_banned, false)
        and (u.ban_until is null or u.ban_until > v_as_of)
      );

    if v_remaining_available_admins < 1 then
      raise exception using errcode = '42501', message = 'Son kullanilabilir admin rolu kaldirilamaz.';
    end if;
  end if;

  if v_previous_role <> v_next_role then
    update public.users as u
    set role = v_next_role, updated_at = v_as_of
    where u.id = p_user_id;

    perform public.create_security_event(
      'admin',
      'user_role_changed',
      'high',
      pg_catalog.format('Kullanici rolu %s -> %s guncellendi.', v_previous_role, v_next_role),
      p_user_id,
      pg_catalog.jsonb_build_object(
        'previousRole', v_previous_role,
        'newRole', v_next_role
      )
    );

    begin
      perform public.create_admin_audit_log(
        'user.role.update',
        'user',
        p_user_id::text,
        pg_catalog.format(
          '%s kullanicisinin rolu %s olarak guncellendi.',
          coalesce(v_target_username, p_user_id::text),
          v_next_role
        ),
        pg_catalog.jsonb_build_object(
          'previousRole', v_previous_role,
          'newRole', v_next_role
        )
      );
    exception when others then
      null;
    end;
  end if;

  return query
  select u.id, coalesce(u.role, 'user'), u.updated_at
  from public.users as u
  where u.id = p_user_id;
end;
$function$;

create or replace function public.set_user_role(
  p_user_id uuid,
  p_role text
)
returns table (
  id uuid,
  role text,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from app_private.set_user_role(
    p_user_id,
    p_role
  );
$function$;

revoke all on function app_private.set_admin_users_ban_state(
  uuid[], boolean, text, timestamptz
) from public, anon, authenticated;
grant execute on function app_private.set_admin_users_ban_state(
  uuid[], boolean, text, timestamptz
) to authenticated;
revoke all on function public.set_admin_users_ban_state(
  uuid[], boolean, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.set_admin_users_ban_state(
  uuid[], boolean, text, timestamptz
) to authenticated;

revoke all on function app_private.set_user_ban_state(
  uuid, boolean, text, timestamptz
) from public, anon, authenticated;
grant execute on function app_private.set_user_ban_state(
  uuid, boolean, text, timestamptz
) to authenticated;
revoke all on function public.set_user_ban_state(uuid, boolean, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_user_ban_state(uuid, boolean, text, timestamptz)
  to authenticated;

revoke all on function app_private.set_user_role(uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.set_user_role(uuid, text)
  to authenticated;
revoke all on function public.set_user_role(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_user_role(uuid, text)
  to authenticated;

comment on function public.set_admin_users_ban_state(uuid[], boolean, text, timestamptz) is
  'En fazla 100 hedefi set-based guncelleyen, self ve son-admin korumali toplu ban RPCsi.';

notify pgrst, 'reload schema';
commit;
