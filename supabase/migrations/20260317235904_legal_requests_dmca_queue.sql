create table if not exists public.legal_requests (
  id uuid primary key default gen_random_uuid(),
  submitter_user_id uuid references public.users(id) on delete set null,
  request_type text not null
    check (request_type in ('dmca', 'copyright', 'trademark', 'impersonation')),
  status text not null default 'new'
    check (status in ('new', 'needs_info', 'under_review', 'actioned', 'rejected')),
  priority text not null default 'normal'
    check (priority in ('normal', 'high')),
  full_name text not null,
  organization_name text,
  email text not null,
  claimant_role text,
  subject text not null,
  description text not null,
  target_urls jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  attestation_good_faith boolean not null default false,
  attestation_authority boolean not null default false,
  attestation_accuracy boolean not null default false,
  electronic_signature text not null,
  admin_notes text,
  resolution_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz
);

create index if not exists legal_requests_status_idx
  on public.legal_requests (status);

create index if not exists legal_requests_type_idx
  on public.legal_requests (request_type);

create index if not exists legal_requests_priority_idx
  on public.legal_requests (priority);

create index if not exists legal_requests_created_at_idx
  on public.legal_requests (created_at desc);

drop trigger if exists trg_legal_requests_set_updated_at on public.legal_requests;
create trigger trg_legal_requests_set_updated_at
  before update on public.legal_requests
  for each row execute function public.set_updated_at();

alter table public.legal_requests enable row level security;

drop policy if exists legal_requests_select_admin on public.legal_requests;
create policy legal_requests_select_admin
  on public.legal_requests
  for select
  using (public.is_admin());

drop policy if exists legal_requests_insert_public on public.legal_requests;
create policy legal_requests_insert_public
  on public.legal_requests
  for insert
  to anon, authenticated
  with check (
    (submitter_user_id is null or submitter_user_id = public.current_public_user_id())
    and attestation_good_faith = true
    and attestation_authority = true
    and attestation_accuracy = true
  );

drop policy if exists legal_requests_update_admin on public.legal_requests;
create policy legal_requests_update_admin
  on public.legal_requests
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists legal_requests_delete_admin on public.legal_requests;
create policy legal_requests_delete_admin
  on public.legal_requests
  for delete
  using (public.is_admin());
