-- ============================================
-- Legal request (DMCA) public flow repair + admin notification
-- Date: 2026-07-09
--
-- Root cause: the 196 insert policy used three functions running with the CALLER
-- permission; 208 took EXECUTE on can_manage_moderation_state and
-- current_public_user_id from anon/authenticated (the bulk
-- policy-rewrite loop only moved current_public_user_id to app_private).
-- Result: on live anonymous AND signed-in users COULD NOT SUBMIT the legal request
-- form ("permission denied for function ..."). Critical before launch.
--
-- This migration:
-- 1) rewrites the insert policy with client-safe app_private helpers
-- 2) guarantees the default_legal_request_priority grant
-- 3) on a new legal request produces a notification to ALL admins (data.event =
-- 'legal_request_new') and adds the event to the web push allowlist; on a DMCA
-- it lands on devices of admins with push on
-- ============================================

begin;

-- ---------- 1) Insert policy: client-safe helpers ----------

drop policy if exists legal_requests_insert_public on public.legal_requests;
create policy legal_requests_insert_public
  on public.legal_requests
  for insert
  to anon, authenticated
  with check (
    app_private.can_manage_moderation_state()
    or (
      (submitter_user_id is null or submitter_user_id = app_private.current_public_user_id())
      and attestation_good_faith = true
      and attestation_authority = true
      and attestation_accuracy = true
      and status = 'new'
      and priority = public.default_legal_request_priority(request_type)
      and admin_notes is null
      and resolution_summary is null
      and reviewed_by is null
      and reviewed_at is null
    )
  );

-- ---------- 2) Function grant guarantee ----------
-- 196 had granted it; a defensive repeat since it may be missing on the live version.

grant execute on function public.default_legal_request_priority(text) to anon, authenticated;

-- ---------- 3) Admin notification on a new legal request ----------

create schema if not exists private;

create or replace function private.notify_admins_new_legal_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, title, message, data)
  select
    u.id,
    'system',
    'Yeni yasal talep: ' || new.request_type,
    left(coalesce(new.subject, ''), 140),
    jsonb_build_object(
      'event', 'legal_request_new',
      'url', '/admin',
      'legal_request_id', new.id,
      'request_type', new.request_type,
      'priority', new.priority
    )
  from public.users u
  where u.role = 'admin';

  return new;
exception when others then
  -- A notification error must never block saving the legal request.
  return new;
end $$;

drop trigger if exists trg_legal_requests_notify_admins on public.legal_requests;
create trigger trg_legal_requests_notify_admins
  after insert on public.legal_requests
  for each row
  execute function private.notify_admins_new_legal_request();

-- Add the legal request event to the push allowlist (no-op with no row; idempotent).
update private.web_push_config
set event_allowlist = (
  select array_agg(distinct g)
  from unnest(event_allowlist || array['legal_request_new']) as g
)
where id is true;

commit;
