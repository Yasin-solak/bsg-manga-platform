-- Translation Studio TEAM flow (Phase 5): page assignment, soft lock, QC state.
--
-- A chapter has 40 pages and the team a few people. So far everyone could see the same work
-- but who did what was written nowhere: two people could translate the same
-- page, one could overwrite the other, and nobody had the answer to "did this page pass
-- the check".
--
-- Three fields answer three separate questions and none replaces another:
-- assigned_to -> WHOSE job this page is,
-- status      -> which stage (QC),
-- locked_by   -> who is working on it RIGHT NOW.

alter table public.admin_typeset_works
  add column if not exists assigned_to uuid references public.users(id) on delete set null,
  add column if not exists status text not null default 'taslak',
  add column if not exists locked_by uuid references public.users(id) on delete set null,
  add column if not exists locked_at timestamptz;

-- The state set is CLOSED: with free text each team would write its own word,
-- the page strip color and summary counter would become meaningless.
alter table public.admin_typeset_works
  drop constraint if exists admin_typeset_works_status_valid;
alter table public.admin_typeset_works
  add constraint admin_typeset_works_status_valid check (
    status in ('taslak', 'ceviri', 'dizgi', 'kontrol', 'onayli')
  );

comment on column public.admin_typeset_works.assigned_to is
  'Sayfanin sorumlusu. Bos ise sahipsiz; ekip panelinde "atanmamis" olarak gorunur.';
comment on column public.admin_typeset_works.status is
  'QC asamasi: taslak -> ceviri -> dizgi -> kontrol -> onayli.';
comment on column public.admin_typeset_works.locked_by is
  'SU AN sayfada calisan kisi. Kilit YUMUSAK: uyarir, engellemez (bkz. locked_at).';

-- The lock must have a TIMEOUT.
--
-- A hard (durable) lock opens the page of someone who closed their tab to nobody and
-- the team goes around asking "who will unlock". Freshness measure is `locked_at`:
-- the client refreshes on each autosave, an unrefreshed lock falls by itself.
create index if not exists admin_typeset_works_lock_idx
  on public.admin_typeset_works (fansub_id, locked_at desc)
  where locked_by is not null;

create index if not exists admin_typeset_works_status_idx
  on public.admin_typeset_works (fansub_id, status);

create index if not exists admin_typeset_works_assignee_idx
  on public.admin_typeset_works (assigned_to)
  where assigned_to is not null;

-- For the team list: the page owner name must show and
-- the general read on `users` already gives public profile fields;
-- we open no separate view here.
--
-- RLS DOES NOT CHANGE: rows are already protected by fansub ownership
-- (`admin_typeset_works_fansub_all`, `app_private.is_fansub_staff`). Assignment and
-- state are columns of the same row so they use the same gate.
