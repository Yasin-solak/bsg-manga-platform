-- ============================================
-- MangaZone | Quest Events Entity (Event entity, Phase 1)
-- Goal: "Event" is now a first-class entity. First the event is created
-- (name/theme/image/date/structure), then its tasks are picked/named.
-- * quest_events  -> event entity (metadata + window + structure)
-- * quests.event_id -> ties event tasks to the event
-- Window/activity comes FROM THE EVENT; with admin_upsert it is COPIED to child tasks
-- (denormalized) -> the engine (record_quest_event/list_quests/claim_quest)
-- runs unchanged.
-- Date: 2026-07-06
-- ============================================

begin;

create table if not exists public.quest_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  theme_key text not null default 'ozel',
  banner_url text,
  structure text not null default 'independent'
    check (structure in ('independent', 'chain')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.quest_events is
  'Sezonluk etkinlik varligi. kind=event gorevler event_id ile buna baglanir; pencere/aktiflik buradan child gorevlere kopyalanir.';

-- FK tying kind=event tasks to the event
alter table public.quests
  add column if not exists event_id uuid references public.quest_events(id) on delete cascade;

create index if not exists quests_event_id_idx on public.quests (event_id);

-- RLS: reads are not public; admin only (list_active_events is already definer).
alter table public.quest_events enable row level security;
drop policy if exists quest_events_admin_all on public.quest_events;
create policy quest_events_admin_all on public.quest_events
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- Move the existing 'yaz-festivali-2026' task_group to an event entity ----
insert into public.quest_events (slug, title, description, theme_key, structure, starts_at, ends_at, is_active, sort_order)
select
  'yaz-festivali-2026',
  'Yaz Okuma Festivali',
  'Yaz boyunca oku, puanla, yorumla ve paylas; festival odullerini topla.',
  'yaz',
  'independent',
  min(q.starts_at),
  max(q.ends_at),
  true,
  0
from public.quests q
where q.kind = 'event' and q.task_group = 'yaz-festivali-2026'
having count(*) > 0
on conflict (slug) do nothing;

-- tie event tasks to the created event (task_group = event slug match)
update public.quests q
set event_id = e.id
from public.quest_events e
where q.kind = 'event'
  and q.event_id is null
  and q.task_group = e.slug;

commit;
