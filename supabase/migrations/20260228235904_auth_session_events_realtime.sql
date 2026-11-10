-- ============================================
-- BSG Manga | Auth session events realtime guard
-- Date: 2026-02-28
-- ============================================

begin;

create table if not exists public.auth_session_events (
  id bigserial primary key,
  auth_user_id uuid not null,
  session_id uuid not null,
  claimed_at timestamptz not null default now()
);

create index if not exists auth_session_events_auth_user_id_claimed_at_idx
  on public.auth_session_events (auth_user_id, claimed_at desc, id desc);

alter table public.auth_session_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'auth_session_events'
      and policyname = 'auth_session_events_select_own'
  ) then
    create policy auth_session_events_select_own
      on public.auth_session_events
      for select
      to authenticated
      using (auth.uid() = auth_user_id);
  end if;
end
$$;

grant select on public.auth_session_events to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    begin
      alter publication supabase_realtime add table public.auth_session_events;
    exception
      when duplicate_object then
        null;
    end;
  end if;
end
$$;

create or replace function public.claim_active_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_previous_session_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_session_id is null then
    raise exception 'Gecerli bir session id zorunludur.';
  end if;

  select u.active_session_id
  into v_previous_session_id
  from public.users u
  where u.auth_user_id = v_auth_user_id
  for update;

  update public.users
  set active_session_id = p_session_id,
      active_session_claimed_at = now()
  where auth_user_id = v_auth_user_id;

  if not found then
    raise exception 'Kullanici profili bulunamadi.';
  end if;

  if v_previous_session_id is distinct from p_session_id then
    insert into public.auth_session_events (auth_user_id, session_id)
    values (v_auth_user_id, p_session_id);

    delete from public.auth_session_events
    where auth_user_id = v_auth_user_id
      and id in (
        select stale.id
        from public.auth_session_events stale
        where stale.auth_user_id = v_auth_user_id
        order by stale.claimed_at desc, stale.id desc
        offset 20
      );
  end if;
end;
$$;

revoke all on function public.claim_active_session(uuid) from public;
grant execute on function public.claim_active_session(uuid) to authenticated;

commit;
