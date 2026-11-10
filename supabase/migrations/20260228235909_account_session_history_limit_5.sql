-- ============================================
-- BSG Manga | Account session history limit 5
-- Date: 2026-02-28
-- ============================================

begin;

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

  if public.is_auth_session_revoked(v_auth_user_id, p_session_id) then
    raise exception 'Bu oturum guvenlik nedeniyle kapatildi.';
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
    insert into public.auth_session_events (auth_user_id, session_id, claimed_at, last_seen_at)
    values (v_auth_user_id, p_session_id, now(), now())
    on conflict (auth_user_id, session_id)
    do update
      set claimed_at = excluded.claimed_at,
          last_seen_at = excluded.last_seen_at;

    delete from public.auth_session_events
    where auth_user_id = v_auth_user_id
      and id in (
        select stale.id
        from public.auth_session_events stale
        where stale.auth_user_id = v_auth_user_id
        order by stale.claimed_at desc, stale.id desc
        offset 5
      );
  end if;
end;
$$;

revoke all on function public.claim_active_session(uuid) from public;
grant execute on function public.claim_active_session(uuid) to authenticated;

create or replace function public.list_my_auth_sessions()
returns table (
  session_id uuid,
  claimed_at timestamptz,
  last_seen_at timestamptz,
  device_id text,
  device_label text,
  platform text,
  browser text,
  user_agent text,
  is_active boolean,
  is_revoked boolean,
  revoked_at timestamptz,
  revoke_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.session_id,
    e.claimed_at,
    e.last_seen_at,
    e.device_id,
    e.device_label,
    e.platform,
    e.browser,
    e.user_agent,
    (u.active_session_id = e.session_id and e.revoked_at is null) as is_active,
    (e.revoked_at is not null) as is_revoked,
    e.revoked_at,
    e.revoke_reason
  from public.auth_session_events e
  join public.users u
    on u.auth_user_id = auth.uid()
  where e.auth_user_id = auth.uid()
  order by
    (u.active_session_id = e.session_id and e.revoked_at is null) desc,
    e.claimed_at desc,
    e.id desc
  limit 5;
$$;

revoke all on function public.list_my_auth_sessions() from public;
grant execute on function public.list_my_auth_sessions() to authenticated;

delete from public.auth_session_events e
where exists (
  select 1
  from public.auth_session_events newer
  where newer.auth_user_id = e.auth_user_id
  group by newer.auth_user_id
  having count(*) > 5
)
and e.id in (
  select stale.id
  from public.auth_session_events stale
  where stale.auth_user_id = e.auth_user_id
  order by stale.claimed_at desc, stale.id desc
  offset 5
);

commit;
