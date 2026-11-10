-- Translation Studio series request decisions.
--
-- Formerly a rejection only changed state: no reason stored, no notice to the requesting
-- team (on approval either). Now a rejection takes an optional reason
-- (at most 500 characters) and on a state change the requesting member gets a notification.

begin;

alter table public.translation_series_drafts
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz;

-- If the old single-parameter version stays, (uuid) and (uuid, text default null)
-- create ambiguity in a PostgREST call.
drop function if exists public.tl_reject_series_draft(uuid);

create or replace function public.tl_reject_series_draft(p_draft_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
begin
  if not app_private.is_admin() then
    raise exception 'yalniz site admini reddedebilir' using errcode = 'PT403';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 500 then
    raise exception 'gerekce en fazla 500 karakter' using errcode = 'PT422';
  end if;
  update public.translation_series_drafts
     set status = 'rejected', review_note = v_note, reviewed_at = now()
   where id = p_draft_id and status = 'pending';
  if not found then raise exception 'bekleyen taslak bulunamadi' using errcode = 'PT404'; end if;
end;
$function$;

revoke all on function public.tl_reject_series_draft(uuid, text) from public, anon;
grant execute on function public.tl_reject_series_draft(uuid, text) to authenticated;

-- Decision notification (approval: series opened or tied to an existing one; rejection: with reason).
create or replace function app_private.tl_series_draft_decision_notify()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_route text := '/fansub/' || new.fansub_id || '/studyo';
begin
  if old.status = 'pending' and new.status = 'approved' then
    perform app_private.tl_task_notify(new.created_by,
      'Seri talebin onaylandı',
      '"' || new.title || '" yayına açıldı; bölümlerini yayınlayabilirsin.',
      v_route, 'tl_series_draft_approved', 'tl-series-draft:' || new.id || ':approved');
  elsif old.status = 'pending' and new.status = 'rejected' then
    perform app_private.tl_task_notify(new.created_by,
      'Seri talebin reddedildi',
      '"' || new.title || '" talebi reddedildi.' || coalesce(' Gerekçe: ' || new.review_note, ''),
      v_route, 'tl_series_draft_rejected', 'tl-series-draft:' || new.id || ':rejected');
  end if;
  return new;
end;
$function$;

revoke all on function app_private.tl_series_draft_decision_notify() from public, anon, authenticated;

drop trigger if exists tl_series_draft_decision_notify on public.translation_series_drafts;
create trigger tl_series_draft_decision_notify
  after update of status on public.translation_series_drafts
  for each row
  when (old.status is distinct from new.status)
  execute function app_private.tl_series_draft_decision_notify();

commit;
