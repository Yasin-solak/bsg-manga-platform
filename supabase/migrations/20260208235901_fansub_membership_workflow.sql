-- Fansub membership workflow:
-- - sending/answering invites
-- - applying to a fansub and staff approval
-- - a member leaving a fansub
-- - blocking new fansub requests from users who are fansub members

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
    where fm.fansub_id = p_fansub_id
      and fm.user_id = public.current_public_user_id()
      and fm.role in ('admin', 'moderator')
  );
$$;

create or replace function public.user_has_any_fansub_membership(p_user_id uuid)
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
    where fm.user_id = p_user_id
      and f.is_active = true
  );
$$;

create table if not exists public.fansub_invites (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  invited_user_id uuid not null references public.users(id) on delete cascade,
  invited_by_user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('member', 'moderator')),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  responded_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fansub_join_requests (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  requester_user_id uuid not null references public.users(id) on delete cascade,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_note text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fansub_invites_fansub_status_idx
  on public.fansub_invites (fansub_id, status, created_at desc);

create index if not exists fansub_invites_invited_status_idx
  on public.fansub_invites (invited_user_id, status, created_at desc);

create unique index if not exists fansub_invites_pending_unique_idx
  on public.fansub_invites (fansub_id, invited_user_id)
  where status = 'pending' and is_active = true;

create index if not exists fansub_join_requests_fansub_status_idx
  on public.fansub_join_requests (fansub_id, status, created_at desc);

create index if not exists fansub_join_requests_requester_status_idx
  on public.fansub_join_requests (requester_user_id, status, created_at desc);

create unique index if not exists fansub_join_requests_pending_unique_idx
  on public.fansub_join_requests (fansub_id, requester_user_id)
  where status = 'pending' and is_active = true;

drop trigger if exists trg_fansub_invites_updated_at on public.fansub_invites;
create trigger trg_fansub_invites_updated_at
  before update on public.fansub_invites
  for each row
  execute function public.set_updated_at();

drop trigger if exists trg_fansub_join_requests_updated_at on public.fansub_join_requests;
create trigger trg_fansub_join_requests_updated_at
  before update on public.fansub_join_requests
  for each row
  execute function public.set_updated_at();

create or replace function public.send_fansub_invite(
  p_fansub_id uuid,
  p_invited_user_id uuid,
  p_role text default 'member',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid;
begin
  v_sender_id := public.current_public_user_id();
  if v_sender_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null or p_invited_user_id is null then
    raise exception 'Fansub veya davet edilecek kullanici bilgisi eksik.';
  end if;

  if p_invited_user_id = v_sender_id then
    raise exception 'Kendinize davet gonderemezsiniz.';
  end if;

  if not exists (
    select 1
    from public.fansubs f
    where f.id = p_fansub_id
      and f.is_active = true
  ) then
    raise exception 'Fansub bulunamadi.';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_invited_user_id
      and u.is_active = true
  ) then
    raise exception 'Davet edilecek kullanici bulunamadi.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu islem icin fansub moderator veya admin yetkisi gerekir.';
  end if;

  if p_role not in ('member', 'moderator') then
    raise exception 'Davet rolu sadece member veya moderator olabilir.';
  end if;

  if public.user_has_any_fansub_membership(p_invited_user_id) then
    raise exception 'Bu kullanici zaten bir fansuba uye.';
  end if;

  begin
    insert into public.fansub_invites (
      fansub_id,
      invited_user_id,
      invited_by_user_id,
      role,
      note,
      status,
      is_active
    )
    values (
      p_fansub_id,
      p_invited_user_id,
      v_sender_id,
      p_role,
      nullif(trim(coalesce(p_note, '')), ''),
      'pending',
      true
    );
  exception
    when unique_violation then
      raise exception 'Bu kullaniciya zaten bekleyen bir davet var.';
  end;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    p_invited_user_id,
    'system',
    'Fansub daveti aldiniz',
    'Bir fansub ekibinden davet aldiniz. Davetlerim alanindan yanitlayabilirsiniz.',
    jsonb_build_object(
      'target', 'fansub_invite',
      'fansub_id', p_fansub_id,
      'invited_by', v_sender_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'invited_user_id', p_invited_user_id,
    'role', p_role
  );
end;
$$;

create or replace function public.respond_fansub_invite(
  p_invite_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_invite public.fansub_invites%rowtype;
  v_action text;
begin
  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  v_action := lower(coalesce(p_action, ''));
  if v_action not in ('accept', 'reject') then
    raise exception 'Gecersiz davet yaniti. accept veya reject kullanin.';
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

  if v_invite.invited_user_id <> v_user_id then
    raise exception 'Bu daveti yanitlama yetkiniz yok.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Sadece bekleyen davetler yanitlanabilir.';
  end if;

  if v_action = 'accept' then
    if public.user_has_any_fansub_membership(v_user_id) then
      raise exception 'Zaten bir fansuba uye oldugunuz icin bu daveti kabul edemezsiniz.';
    end if;

    insert into public.fansub_members (fansub_id, user_id, role)
    values (v_invite.fansub_id, v_user_id, v_invite.role)
    on conflict (fansub_id, user_id)
    do nothing;

    update public.fansub_invites
    set
      status = 'accepted',
      responded_at = now()
    where id = p_invite_id;

    -- When a member joins a fansub other pending invites and applications close.
    update public.fansub_invites
    set
      status = 'cancelled',
      responded_at = now()
    where invited_user_id = v_user_id
      and status = 'pending'
      and id <> p_invite_id;

    update public.fansub_join_requests
    set
      status = 'cancelled',
      reviewed_by = v_user_id,
      reviewed_at = now(),
      review_note = coalesce(review_note, 'Kullanici baska bir fansuba katildigi icin kapatildi.')
    where requester_user_id = v_user_id
      and status = 'pending';

    insert into public.notifications (user_id, type, title, message, data)
    values (
      v_invite.invited_by_user_id,
      'system',
      'Fansub daveti kabul edildi',
      'Gonderdiginiz fansub daveti kabul edildi.',
      jsonb_build_object(
        'target', 'fansub_invite',
        'invite_id', p_invite_id,
        'fansub_id', v_invite.fansub_id
      )
    );

    return jsonb_build_object(
      'success', true,
      'invite_id', p_invite_id,
      'status', 'accepted',
      'fansub_id', v_invite.fansub_id
    );
  end if;

  update public.fansub_invites
  set
    status = 'rejected',
    responded_at = now()
  where id = p_invite_id;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    v_invite.invited_by_user_id,
    'system',
    'Fansub daveti reddedildi',
    'Gonderdiginiz fansub daveti reddedildi.',
    jsonb_build_object(
      'target', 'fansub_invite',
      'invite_id', p_invite_id,
      'fansub_id', v_invite.fansub_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'invite_id', p_invite_id,
    'status', 'rejected',
    'fansub_id', v_invite.fansub_id
  );
end;
$$;

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
    or v_invite.invited_by_user_id = v_actor_id
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

create or replace function public.submit_fansub_join_request(
  p_fansub_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi eksik.';
  end if;

  if not exists (
    select 1
    from public.fansubs f
    where f.id = p_fansub_id
      and f.is_active = true
  ) then
    raise exception 'Fansub bulunamadi.';
  end if;

  if public.user_has_any_fansub_membership(v_user_id) then
    raise exception 'Zaten bir fansuba uye oldugunuz icin yeni basvuru gonderemezsiniz.';
  end if;

  if exists (
    select 1
    from public.fansub_invites fi
    where fi.fansub_id = p_fansub_id
      and fi.invited_user_id = v_user_id
      and fi.status = 'pending'
      and fi.is_active = true
  ) then
    raise exception 'Bu fansubdan bekleyen davetiniz var. Once daveti yanitlayin.';
  end if;

  begin
    insert into public.fansub_join_requests (
      fansub_id,
      requester_user_id,
      message,
      status,
      is_active
    )
    values (
      p_fansub_id,
      v_user_id,
      nullif(trim(coalesce(p_message, '')), ''),
      'pending',
      true
    );
  exception
    when unique_violation then
      raise exception 'Bu fansub icin zaten bekleyen bir basvurunuz var.';
  end;

  insert into public.notifications (user_id, type, title, message, data)
  select
    fm.user_id,
    'system',
    'Yeni fansub uyelik basvurusu',
    'Fansubunuza yeni bir katilim basvurusu geldi.',
    jsonb_build_object(
      'target', 'fansub_join_request',
      'fansub_id', p_fansub_id,
      'requester_id', v_user_id
    )
  from public.fansub_members fm
  where fm.fansub_id = p_fansub_id
    and fm.role in ('admin', 'moderator');

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'requester_user_id', v_user_id,
    'status', 'pending'
  );
end;
$$;

create or replace function public.review_fansub_join_request(
  p_request_id uuid,
  p_action text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_id uuid;
  v_action text;
  v_request public.fansub_join_requests%rowtype;
begin
  v_reviewer_id := public.current_public_user_id();
  if v_reviewer_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  v_action := lower(coalesce(p_action, ''));
  if v_action not in ('approve', 'reject') then
    raise exception 'Gecersiz aksiyon. approve veya reject kullanin.';
  end if;

  select *
  into v_request
  from public.fansub_join_requests fjr
  where fjr.id = p_request_id
    and fjr.is_active = true
  for update;

  if not found then
    raise exception 'Fansub basvurusu bulunamadi.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Sadece bekleyen basvurular degerlendirilebilir.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(v_request.fansub_id)) then
    raise exception 'Bu basvuruyu yonetme yetkiniz yok.';
  end if;

  if v_action = 'approve' then
    if public.user_has_any_fansub_membership(v_request.requester_user_id) then
      raise exception 'Kullanici zaten bir fansuba uye oldugu icin basvuru onaylanamaz.';
    end if;

    insert into public.fansub_members (fansub_id, user_id, role)
    values (v_request.fansub_id, v_request.requester_user_id, 'member')
    on conflict (fansub_id, user_id)
    do nothing;

    update public.fansub_join_requests
    set
      status = 'approved',
      review_note = nullif(trim(coalesce(p_review_note, review_note)), ''),
      reviewed_by = v_reviewer_id,
      reviewed_at = now()
    where id = p_request_id;

    update public.fansub_invites
    set
      status = 'cancelled',
      responded_at = now()
    where invited_user_id = v_request.requester_user_id
      and status = 'pending';

    update public.fansub_join_requests
    set
      status = 'cancelled',
      reviewed_by = v_reviewer_id,
      reviewed_at = now(),
      review_note = coalesce(review_note, 'Kullanici baska bir fansuba alindigi icin kapatildi.')
    where requester_user_id = v_request.requester_user_id
      and status = 'pending'
      and id <> p_request_id;

    insert into public.notifications (user_id, type, title, message, data)
    values (
      v_request.requester_user_id,
      'system',
      'Fansub basvurunuz onaylandi',
      'Basvurdugunuz fansub sizi ekibe kabul etti.',
      jsonb_build_object(
        'target', 'fansub_join_request',
        'request_id', p_request_id,
        'fansub_id', v_request.fansub_id,
        'status', 'approved'
      )
    );

    return jsonb_build_object(
      'success', true,
      'request_id', p_request_id,
      'fansub_id', v_request.fansub_id,
      'status', 'approved'
    );
  end if;

  update public.fansub_join_requests
  set
    status = 'rejected',
    review_note = nullif(trim(coalesce(p_review_note, review_note)), ''),
    reviewed_by = v_reviewer_id,
    reviewed_at = now()
  where id = p_request_id;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    v_request.requester_user_id,
    'system',
    'Fansub basvurunuz reddedildi',
    coalesce(nullif(trim(coalesce(p_review_note, '')), ''), 'Basvurunuz ekip tarafindan uygun bulunmadi.'),
    jsonb_build_object(
      'target', 'fansub_join_request',
      'request_id', p_request_id,
      'fansub_id', v_request.fansub_id,
      'status', 'rejected'
    )
  );

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'fansub_id', v_request.fansub_id,
    'status', 'rejected'
  );
end;
$$;

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

alter table public.fansub_invites enable row level security;
alter table public.fansub_join_requests enable row level security;

drop policy if exists fansub_invites_select_rule on public.fansub_invites;
create policy fansub_invites_select_rule
  on public.fansub_invites
  for select
  using (
    invited_user_id = public.current_public_user_id()
    or invited_by_user_id = public.current_public_user_id()
    or public.is_admin()
    or public.is_fansub_staff(fansub_id)
  );

drop policy if exists fansub_invites_insert_staff_or_admin on public.fansub_invites;
create policy fansub_invites_insert_staff_or_admin
  on public.fansub_invites
  for insert
  with check (
    invited_by_user_id = public.current_public_user_id()
    and (public.is_admin() or public.is_fansub_staff(fansub_id))
    and status = 'pending'
  );

drop policy if exists fansub_invites_update_rule on public.fansub_invites;
create policy fansub_invites_update_rule
  on public.fansub_invites
  for update
  using (
    invited_user_id = public.current_public_user_id()
    or invited_by_user_id = public.current_public_user_id()
    or public.is_admin()
    or public.is_fansub_staff(fansub_id)
  )
  with check (
    invited_user_id = public.current_public_user_id()
    or invited_by_user_id = public.current_public_user_id()
    or public.is_admin()
    or public.is_fansub_staff(fansub_id)
  );

drop policy if exists fansub_invites_delete_admin_only on public.fansub_invites;
create policy fansub_invites_delete_admin_only
  on public.fansub_invites
  for delete
  using (public.is_admin());

drop policy if exists fansub_join_requests_select_rule on public.fansub_join_requests;
create policy fansub_join_requests_select_rule
  on public.fansub_join_requests
  for select
  using (
    requester_user_id = public.current_public_user_id()
    or public.is_admin()
    or public.is_fansub_staff(fansub_id)
  );

drop policy if exists fansub_join_requests_insert_owner on public.fansub_join_requests;
create policy fansub_join_requests_insert_owner
  on public.fansub_join_requests
  for insert
  with check (
    requester_user_id = public.current_public_user_id()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and not public.user_has_any_fansub_membership(requester_user_id)
  );

drop policy if exists fansub_join_requests_update_staff_or_admin on public.fansub_join_requests;
create policy fansub_join_requests_update_staff_or_admin
  on public.fansub_join_requests
  for update
  using (
    public.is_admin()
    or public.is_fansub_staff(fansub_id)
  )
  with check (
    public.is_admin()
    or public.is_fansub_staff(fansub_id)
  );

drop policy if exists fansub_join_requests_delete_admin_only on public.fansub_join_requests;
create policy fansub_join_requests_delete_admin_only
  on public.fansub_join_requests
  for delete
  using (public.is_admin());

-- Strengthen the fansub request rule:
-- A user who is a fansub member cannot send a new fansub request.
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
  );

grant select, insert, update, delete on public.fansub_invites to authenticated;
grant select, insert, update, delete on public.fansub_join_requests to authenticated;

grant execute on function public.send_fansub_invite(uuid, uuid, text, text) to authenticated;
grant execute on function public.respond_fansub_invite(uuid, text) to authenticated;
grant execute on function public.cancel_fansub_invite(uuid) to authenticated;
grant execute on function public.submit_fansub_join_request(uuid, text) to authenticated;
grant execute on function public.review_fansub_join_request(uuid, text, text) to authenticated;
grant execute on function public.leave_fansub(uuid) to authenticated;
