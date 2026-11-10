-- Fansub kurma talepleri + admin onay akisiyla otomatik fansub acilisi.

create table if not exists public.fansub_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.users(id) on delete cascade,
  requested_name text not null,
  requested_slug text not null,
  requested_avatar_url text,
  requested_description text,
  requested_primary_color text,
  requested_secondary_color text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_fansub_id uuid references public.fansubs(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fansub_requests_requester_idx
  on public.fansub_requests (requester_user_id, created_at desc);

create index if not exists fansub_requests_status_idx
  on public.fansub_requests (status, created_at desc);

create unique index if not exists fansub_requests_pending_slug_unique_idx
  on public.fansub_requests (lower(requested_slug))
  where status = 'pending' and is_active = true;

drop trigger if exists trg_fansub_requests_updated_at on public.fansub_requests;
create trigger trg_fansub_requests_updated_at
  before update on public.fansub_requests
  for each row
  execute function public.set_updated_at();

create or replace function public.approve_fansub_request(
  p_request_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_request public.fansub_requests%rowtype;
  v_new_fansub_id uuid;
begin
  v_admin_id := public.current_public_user_id();
  if v_admin_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  select *
  into v_request
  from public.fansub_requests
  where id = p_request_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Fansub talebi bulunamadi.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Sadece bekleyen talepler onaylanabilir.';
  end if;

  if exists (
    select 1
    from public.fansubs f
    where lower(f.slug) = lower(v_request.requested_slug)
  ) then
    raise exception 'Bu slug zaten kullaniliyor.';
  end if;

  insert into public.fansubs (
    name,
    slug,
    avatar_url,
    description,
    primary_color,
    secondary_color,
    is_active
  )
  values (
    v_request.requested_name,
    v_request.requested_slug,
    v_request.requested_avatar_url,
    v_request.requested_description,
    v_request.requested_primary_color,
    v_request.requested_secondary_color,
    true
  )
  returning id into v_new_fansub_id;

  insert into public.fansub_members (fansub_id, user_id, role)
  values (v_new_fansub_id, v_request.requester_user_id, 'admin')
  on conflict (fansub_id, user_id)
  do update set role = 'admin';

  update public.fansub_requests
  set
    status = 'approved',
    review_note = nullif(trim(coalesce(p_review_note, review_note)), ''),
    reviewed_by = v_admin_id,
    reviewed_at = now(),
    created_fansub_id = v_new_fansub_id
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'approved',
    'fansub_id', v_new_fansub_id
  );
end;
$$;

create or replace function public.reject_fansub_request(
  p_request_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_request public.fansub_requests%rowtype;
begin
  v_admin_id := public.current_public_user_id();
  if v_admin_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  select *
  into v_request
  from public.fansub_requests
  where id = p_request_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Fansub talebi bulunamadi.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Sadece bekleyen talepler reddedilebilir.';
  end if;

  update public.fansub_requests
  set
    status = 'rejected',
    review_note = nullif(trim(coalesce(p_review_note, review_note)), ''),
    reviewed_by = v_admin_id,
    reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'rejected'
  );
end;
$$;

alter table public.fansub_requests enable row level security;

drop policy if exists fansub_requests_select_admin_or_owner on public.fansub_requests;
create policy fansub_requests_select_admin_or_owner
  on public.fansub_requests
  for select
  using (
    public.is_admin()
    or requester_user_id = public.current_public_user_id()
  );

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
  );

drop policy if exists fansub_requests_update_admin_only on public.fansub_requests;
create policy fansub_requests_update_admin_only
  on public.fansub_requests
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists fansub_requests_delete_admin_only on public.fansub_requests;
create policy fansub_requests_delete_admin_only
  on public.fansub_requests
  for delete
  using (public.is_admin());

grant select, insert, update, delete on public.fansub_requests to authenticated;
grant execute on function public.approve_fansub_request(uuid, text) to authenticated;
grant execute on function public.reject_fansub_request(uuid, text) to authenticated;
