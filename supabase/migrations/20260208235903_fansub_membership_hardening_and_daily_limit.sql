-- Fansub membership hardening + gunluk fansub kurma limiti

create or replace function public.is_fansub_admin(p_fansub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fansub_members fm
    join public.fansubs f on f.id = fm.fansub_id
    where fm.fansub_id = p_fansub_id
      and fm.user_id = public.current_public_user_id()
      and fm.role = 'admin'
      and f.is_active = true
  );
$$;

create or replace function public.is_fansub_staff(p_fansub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fansub_members fm
    join public.fansubs f on f.id = fm.fansub_id
    where fm.fansub_id = p_fansub_id
      and fm.user_id = public.current_public_user_id()
      and fm.role in ('admin', 'moderator')
      and f.is_active = true
  );
$$;

create or replace function public.can_create_fansub_request_daily(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.fansub_requests fr
    where fr.requester_user_id = p_user_id
      and fr.created_at >= now() - interval '24 hours'
      and fr.is_active = true
  );
$$;

drop policy if exists fansub_requests_insert_owner on public.fansub_requests;
create policy fansub_requests_insert_owner
  on public.fansub_requests
  for insert
  with check (
    requester_user_id = public.current_public_user_id()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and created_fansub_id is null
    and not public.user_has_any_fansub_membership(requester_user_id)
    and public.can_create_fansub_request_daily(requester_user_id)
  );

create or replace function public.cancel_fansub_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_invite public.fansub_invites%rowtype;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  select *
  into v_invite
  from public.fansub_invites fi
  where fi.id = p_invite_id
    and fi.is_active = true
  for update;

  if not found then
    raise exception 'Davet bulunamadi.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Sadece bekleyen davet iptal edilebilir.';
  end if;

  if not (
    public.is_admin()
    or public.is_fansub_staff(v_invite.fansub_id)
  ) then
    raise exception 'Bu daveti iptal etme yetkiniz yok.';
  end if;

  update public.fansub_invites
  set
    status = 'cancelled',
    responded_at = now()
  where id = p_invite_id;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    v_invite.invited_user_id,
    'system',
    'Fansub daveti iptal edildi',
    'Size gonderilen bir fansub daveti iptal edildi.',
    jsonb_build_object(
      'target', 'fansub_invite',
      'invite_id', p_invite_id,
      'fansub_id', v_invite.fansub_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'invite_id', p_invite_id,
    'status', 'cancelled',
    'fansub_id', v_invite.fansub_id
  );
end;
$$;

grant execute on function public.can_create_fansub_request_daily(uuid) to authenticated;
grant execute on function public.cancel_fansub_invite(uuid) to authenticated;
