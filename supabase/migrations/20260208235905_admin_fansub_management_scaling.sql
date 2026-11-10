-- Admin fansub management:
-- - Membership history (active + departed members)
-- - Membership cleanup on inactive fansubs
-- - Role/tag update RPC for the admin panel
-- - Fansub active/inactive toggle RPC

create table if not exists public.fansub_member_history (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  role text not null check (role in ('admin', 'moderator', 'member')),
  team_tag text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason text not null default 'active'
    check (left_reason in ('active', 'leave', 'removed', 'admin_transfer_exit', 'fansub_deactivated')),
  ended_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fansub_member_history_active_unique_idx
  on public.fansub_member_history (fansub_id, user_id)
  where left_at is null and user_id is not null;

create index if not exists fansub_member_history_fansub_left_joined_idx
  on public.fansub_member_history (fansub_id, left_at, joined_at desc);

create index if not exists fansub_member_history_user_joined_idx
  on public.fansub_member_history (user_id, joined_at desc);

drop trigger if exists trg_fansub_member_history_updated_at on public.fansub_member_history;
create trigger trg_fansub_member_history_updated_at
  before update on public.fansub_member_history
  for each row
  execute function public.set_updated_at();

-- On first setup moves current active memberships to the history table.
insert into public.fansub_member_history (
  fansub_id,
  user_id,
  role,
  team_tag,
  joined_at,
  left_reason
)
select
  fm.fansub_id,
  fm.user_id,
  fm.role,
  fm.team_tag,
  fm.created_at,
  'active'
from public.fansub_members fm
where not exists (
  select 1
  from public.fansub_member_history h
  where h.fansub_id = fm.fansub_id
    and h.user_id = fm.user_id
    and h.left_at is null
);

create or replace function public.sync_fansub_member_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exit_reason text;
  v_ended_by_text text;
  v_ended_by uuid;
begin
  if tg_op = 'INSERT' then
    update public.fansub_member_history
    set
      role = new.role,
      team_tag = new.team_tag,
      joined_at = coalesce(new.created_at, joined_at),
      left_at = null,
      left_reason = 'active',
      ended_by_user_id = null,
      updated_at = now()
    where fansub_id = new.fansub_id
      and user_id = new.user_id
      and left_at is null;

    if not found then
      insert into public.fansub_member_history (
        fansub_id,
        user_id,
        role,
        team_tag,
        joined_at,
        left_reason
      )
      values (
        new.fansub_id,
        new.user_id,
        new.role,
        new.team_tag,
        coalesce(new.created_at, now()),
        'active'
      );
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    update public.fansub_member_history
    set
      role = new.role,
      team_tag = new.team_tag,
      updated_at = now()
    where fansub_id = new.fansub_id
      and user_id = new.user_id
      and left_at is null;

    return new;
  end if;

  if tg_op = 'DELETE' then
    v_exit_reason := nullif(trim(coalesce(current_setting('app.membership_exit_reason', true), '')), '');
    if v_exit_reason is null then
      v_exit_reason := 'removed';
    end if;

    v_ended_by_text := nullif(trim(coalesce(current_setting('app.membership_ended_by', true), '')), '');
    begin
      v_ended_by := case when v_ended_by_text is null then null else v_ended_by_text::uuid end;
    exception
      when others then
        v_ended_by := null;
    end;

    update public.fansub_member_history
    set
      left_at = coalesce(left_at, now()),
      left_reason = v_exit_reason,
      ended_by_user_id = coalesce(v_ended_by, ended_by_user_id),
      updated_at = now()
    where fansub_id = old.fansub_id
      and user_id = old.user_id
      and left_at is null;

    if not found then
      insert into public.fansub_member_history (
        fansub_id,
        user_id,
        role,
        team_tag,
        joined_at,
        left_at,
        left_reason,
        ended_by_user_id
      )
      values (
        old.fansub_id,
        old.user_id,
        old.role,
        old.team_tag,
        coalesce(old.created_at, now()),
        now(),
        v_exit_reason,
        v_ended_by
      );
    end if;

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_fansub_member_history on public.fansub_members;
create trigger trg_sync_fansub_member_history
  after insert or update or delete on public.fansub_members
  for each row
  execute function public.sync_fansub_member_history();

create or replace function public.cleanup_fansub_memberships_on_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
begin
  if old.is_active = true and new.is_active = false then
    v_actor_id := public.current_public_user_id();
    perform set_config('app.membership_exit_reason', 'fansub_deactivated', true);
    if v_actor_id is not null then
      perform set_config('app.membership_ended_by', v_actor_id::text, true);
    end if;

    delete from public.fansub_members
    where fansub_id = new.id;

    if to_regclass('public.fansub_invites') is not null then
      update public.fansub_invites
      set
        status = 'cancelled',
        is_active = false,
        responded_at = coalesce(responded_at, now())
      where fansub_id = new.id
        and status = 'pending'
        and is_active = true;
    end if;

    if to_regclass('public.fansub_join_requests') is not null then
      update public.fansub_join_requests
      set
        status = 'cancelled',
        is_active = false,
        reviewed_at = coalesce(reviewed_at, now()),
        reviewed_by = coalesce(reviewed_by, v_actor_id),
        review_note = coalesce(nullif(trim(coalesce(review_note, '')), ''), 'Fansub deaktif edildi.')
      where fansub_id = new.id
        and status = 'pending'
        and is_active = true;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cleanup_fansub_memberships_on_deactivate on public.fansubs;
create trigger trg_cleanup_fansub_memberships_on_deactivate
  after update of is_active on public.fansubs
  for each row
  execute function public.cleanup_fansub_memberships_on_deactivate();

create or replace function public.admin_set_fansub_active(
  p_fansub_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_fansub_name text;
  v_previous_is_active boolean;
  v_removed_members integer := 0;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if not public.is_admin() then
    raise exception 'Bu islem sadece admin tarafindan yapilabilir.';
  end if;

  select f.name, f.is_active
  into v_fansub_name, v_previous_is_active
  from public.fansubs f
  where f.id = p_fansub_id
  for update;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  if p_is_active = false and v_previous_is_active = false then
    perform set_config('app.membership_exit_reason', 'fansub_deactivated', true);
    perform set_config('app.membership_ended_by', v_actor_id::text, true);
    delete from public.fansub_members
    where fansub_id = p_fansub_id;
    get diagnostics v_removed_members = row_count;
  end if;

  update public.fansubs
  set
    is_active = p_is_active,
    updated_at = now()
  where id = p_fansub_id;

  if p_is_active = false and v_previous_is_active = true then
    select count(*)
    into v_removed_members
    from public.fansub_member_history h
    where h.fansub_id = p_fansub_id
      and h.left_reason = 'fansub_deactivated'
      and h.left_at >= now() - interval '1 minute';
  end if;

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'fansub_name', v_fansub_name,
    'is_active', p_is_active,
    'previous_is_active', v_previous_is_active,
    'removed_member_count', v_removed_members
  );
end;
$$;

create or replace function public.admin_update_fansub_member(
  p_fansub_id uuid,
  p_member_user_id uuid,
  p_role text,
  p_team_tag text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_fansub_is_active boolean;
  v_current_role text;
  v_new_role text;
  v_team_tag text;
  v_other_admin_count integer := 0;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if not public.is_admin() then
    raise exception 'Bu islem sadece admin tarafindan yapilabilir.';
  end if;

  if p_fansub_id is null or p_member_user_id is null then
    raise exception 'Fansub ve uye bilgisi zorunludur.';
  end if;

  select f.is_active
  into v_fansub_is_active
  from public.fansubs f
  where f.id = p_fansub_id
  for update;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  if v_fansub_is_active = false then
    raise exception 'Pasif fansubda uye rol/tag guncellenemez.';
  end if;

  select fm.role
  into v_current_role
  from public.fansub_members fm
  where fm.fansub_id = p_fansub_id
    and fm.user_id = p_member_user_id
  for update;

  if not found then
    raise exception 'Bu kullanici fansubun aktif uyesi degil.';
  end if;

  v_new_role := lower(trim(coalesce(p_role, '')));
  if v_new_role not in ('admin', 'moderator', 'member') then
    raise exception 'Rol sadece admin, moderator veya member olabilir.';
  end if;

  v_team_tag := nullif(trim(coalesce(p_team_tag, '')), '');
  if v_team_tag is not null and char_length(v_team_tag) < 2 then
    raise exception 'Uye etiketi en az 2 karakter olmali.';
  end if;
  if v_team_tag is not null and char_length(v_team_tag) > 40 then
    raise exception 'Uye etiketi en fazla 40 karakter olabilir.';
  end if;

  if v_new_role = 'admin' then
    update public.fansub_members
    set role = 'moderator'
    where fansub_id = p_fansub_id
      and role = 'admin'
      and user_id <> p_member_user_id;
  elsif v_current_role = 'admin' and v_new_role <> 'admin' then
    select count(*)
    into v_other_admin_count
    from public.fansub_members
    where fansub_id = p_fansub_id
      and role = 'admin'
      and user_id <> p_member_user_id;

    if v_other_admin_count = 0 then
      raise exception 'Fansubda en az bir admin kalmalidir.';
    end if;
  end if;

  update public.fansub_members
  set
    role = v_new_role,
    team_tag = v_team_tag
  where fansub_id = p_fansub_id
    and user_id = p_member_user_id;

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'member_user_id', p_member_user_id,
    'role', v_new_role,
    'team_tag', v_team_tag
  );
end;
$$;

alter table public.fansub_member_history enable row level security;

drop policy if exists fansub_member_history_select_rule on public.fansub_member_history;
create policy fansub_member_history_select_rule
  on public.fansub_member_history
  for select
  using (
    public.is_admin()
    or user_id = public.current_public_user_id()
    or public.is_fansub_staff(fansub_id)
  );

drop policy if exists fansub_member_history_admin_write on public.fansub_member_history;
create policy fansub_member_history_admin_write
  on public.fansub_member_history
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.fansub_member_history to authenticated;
grant execute on function public.admin_set_fansub_active(uuid, boolean) to authenticated;
grant execute on function public.admin_update_fansub_member(uuid, uuid, text, text) to authenticated;

create or replace function public.leave_fansub(p_fansub_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
begin
  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  select fm.role
  into v_role
  from public.fansub_members fm
  where fm.fansub_id = p_fansub_id
    and fm.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Bu fansubda aktif uyeliginiz bulunmuyor.';
  end if;

  if v_role = 'admin' then
    raise exception 'Admin rolu ile ayrilamazsiniz. Once yetki devri yapin.';
  end if;

  perform set_config('app.membership_exit_reason', 'leave', true);
  perform set_config('app.membership_ended_by', v_user_id::text, true);

  delete from public.fansub_members
  where fansub_id = p_fansub_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'user_id', v_user_id,
    'action', 'leave'
  );
end;
$$;

grant execute on function public.leave_fansub(uuid) to authenticated;
