begin;

create or replace function public.set_user_role(
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
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_next_role text := lower(trim(coalesce(p_role, '')));
  v_previous_role text;
  v_target_username text;
  v_remaining_admins bigint := 0;
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if p_user_id is null then
    raise exception 'Kullanici secimi zorunlu.';
  end if;

  if v_next_role not in ('user', 'moderator', 'admin') then
    raise exception 'Gecersiz rol secimi.';
  end if;

  select u.role, u.username
  into v_previous_role, v_target_username
  from public.users u
  where u.id = p_user_id
  for update;

  if not found then
    raise exception 'Kullanici bulunamadi.';
  end if;

  v_previous_role := coalesce(v_previous_role, 'user');

  if p_user_id = v_actor_id and v_next_role <> 'admin' then
    raise exception 'Kendi admin rolunu dusuremezsin.';
  end if;

  if v_previous_role = 'admin' and v_next_role <> 'admin' then
    select count(*)
    into v_remaining_admins
    from public.users u
    where u.role = 'admin'
      and u.id <> p_user_id;

    if v_remaining_admins = 0 then
      raise exception 'Son admin rolu kaldirilamaz.';
    end if;
  end if;

  if v_previous_role <> v_next_role then
    update public.users u
    set
      role = v_next_role,
      updated_at = now()
    where u.id = p_user_id;

    perform public.create_security_event(
      'admin',
      'user_role_changed',
      'high',
      format('Kullanici rolu %s -> %s guncellendi.', v_previous_role, v_next_role),
      p_user_id,
      jsonb_build_object(
        'previousRole', v_previous_role,
        'newRole', v_next_role
      )
    );

    begin
      perform public.create_admin_audit_log(
        'user.role.update',
        'user',
        p_user_id::text,
        format('%s kullanicisinin rolu %s olarak guncellendi.', coalesce(v_target_username, p_user_id::text), v_next_role),
        jsonb_build_object(
          'previousRole', v_previous_role,
          'newRole', v_next_role
        )
      );
    exception
      when others then
        null;
    end;
  end if;

  return query
  select
    u.id,
    coalesce(u.role, 'user'),
    u.updated_at
  from public.users u
  where u.id = p_user_id;
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;

commit;
