-- ============================================
-- MangaZone | Quest Engine Foundation (Phase 1a)
-- Merged task engine: user + fansub in one model.
-- * quests          -> task definition (achievement | daily | weekly | event)
-- * quest_progress  -> per-period progress + claim snapshot
-- * quest_period_key -> daily/weekly reset window helper
-- This migration only sets up the schema; behavior does not change (old *_reward_tasks
-- RPCs keep feeding the UI). Engine RPCs and data import are Phase 1b.
-- Date: 2026-06-25
-- ============================================

begin;

-- ============================================
-- 1) Period key helper (Europe/Istanbul reset)
-- daily  -> 'YYYY-MM-DD'   (resets at 00:00 TR each night)
-- weekly -> 'IYYY-Www'     (ISO week, Monday reset)
-- other  -> 'lifetime'     (achievement/event single window)
-- ============================================
create or replace function public.quest_period_key(
  p_kind text,
  p_at timestamptz default now()
)
returns text
language sql
stable
set search_path = public
as $$
  select case lower(coalesce(p_kind, 'achievement'))
    when 'daily' then to_char((p_at at time zone 'Europe/Istanbul')::date, 'YYYY-MM-DD')
    when 'weekly' then to_char(p_at at time zone 'Europe/Istanbul', 'IYYY"-W"IW')
    else 'lifetime'
  end;
$$;

grant execute on function public.quest_period_key(text, timestamptz) to authenticated;

-- ============================================
-- 2) quests -> merged task definition
-- ============================================
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,

  -- subject and cadence
  audience text not null
    check (audience in ('user', 'fansub')),
  kind text not null default 'achievement'
    check (kind in ('achievement', 'daily', 'weekly', 'event')),

  -- ilerleme metrigi (mevcut metrik sozlugu)
  metric_key text not null,
  target_value integer not null check (target_value > 0),

  -- reward
  reward_kind text not null default 'coin'
    check (reward_kind in ('coin', 'badge', 'store_item', 'boost_credit')),
  coin_reward integer not null default 0 check (coin_reward >= 0),
  badge_id uuid references public.badges(id) on delete set null,
  reward_item_id uuid references public.store_items(id) on delete set null,
  boost_credit integer not null default 0 check (boost_credit >= 0),

  -- kozmetik kapisi: "baya baya zaman harcamis" kisi sarti
  gate_metric_key text,
  gate_min_value integer check (gate_min_value is null or gate_min_value >= 0),
  min_account_age_days integer not null default 0 check (min_account_age_days >= 0),

  -- zincir / tier (mevcut davranisi korur)
  task_group text not null default 'default',
  tier_level integer not null default 1 check (tier_level between 1 and 5),
  unlock_requires_quest_id uuid references public.quests(id) on delete set null,
  sort_order integer not null default 0,

  -- time window for the event type
  starts_at timestamptz,
  ends_at timestamptz,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- reward_item_id required for a store_item reward; boost_credit makes sense only for a fansub
  constraint quests_store_item_requires_ref
    check (reward_kind <> 'store_item' or reward_item_id is not null),
  constraint quests_boost_credit_audience
    check (boost_credit = 0 or audience = 'fansub')
);

create index if not exists quests_audience_kind_active_idx
  on public.quests (audience, kind, is_active, sort_order asc);

create index if not exists quests_group_tier_idx
  on public.quests (task_group, tier_level, sort_order asc);

create index if not exists quests_active_window_idx
  on public.quests (is_active, starts_at, ends_at)
  where kind = 'event';

drop trigger if exists trg_quests_updated_at on public.quests;
create trigger trg_quests_updated_at
  before update on public.quests
  for each row
  execute function public.set_updated_at();

alter table public.quests enable row level security;

drop policy if exists quests_select_authenticated on public.quests;
create policy quests_select_authenticated
  on public.quests
  for select
  using (auth.role() = 'authenticated' or public.is_admin());

drop policy if exists quests_admin_write on public.quests;
create policy quests_admin_write
  on public.quests
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.quests to authenticated;
grant insert, update, delete on table public.quests to authenticated; -- admin policy ile sinirli

-- ============================================
-- 3) quest_progress -> per-period progress + claim
-- unique(quest, subject, period_key) = one claim per period
-- ============================================
create table if not exists public.quest_progress (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  subject_type text not null
    check (subject_type in ('user', 'fansub')),
  subject_id uuid not null,
  period_key text not null default 'lifetime',

  progress_value bigint not null default 0 check (progress_value >= 0),
  is_completed boolean not null default false,
  completed_at timestamptz,

  claimed_at timestamptz,
  claimed_by uuid references public.users(id) on delete set null,
  credited_coin integer not null default 0 check (credited_coin >= 0),

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (quest_id, subject_type, subject_id, period_key)
);

create index if not exists quest_progress_subject_idx
  on public.quest_progress (subject_type, subject_id, period_key);

create index if not exists quest_progress_quest_idx
  on public.quest_progress (quest_id);

create index if not exists quest_progress_claimable_idx
  on public.quest_progress (subject_type, subject_id)
  where is_completed = true and claimed_at is null;

drop trigger if exists trg_quest_progress_updated_at on public.quest_progress;
create trigger trg_quest_progress_updated_at
  before update on public.quest_progress
  for each row
  execute function public.set_updated_at();

alter table public.quest_progress enable row level security;

-- Read: users see their own progress, fansub managers fansub progress, admins all.
-- No writes: all mutations through SECURITY DEFINER RPCs (Phase 1b).
drop policy if exists quest_progress_select_own on public.quest_progress;
create policy quest_progress_select_own
  on public.quest_progress
  for select
  using (
    public.is_admin()
    or (subject_type = 'user' and subject_id = public.current_public_user_id())
    or (subject_type = 'fansub' and public.is_fansub_staff(subject_id))
  );

grant select on table public.quest_progress to authenticated;

-- ============================================
-- 4) acquired_via -> recognize the 'quest_reward' source (for cosmetic grants)
-- Extends the existing check; old values are kept.
-- ============================================
alter table public.user_inventory_items
  drop constraint if exists user_inventory_items_acquired_via_check;

alter table public.user_inventory_items
  add constraint user_inventory_items_acquired_via_check
  check (
    acquired_via in (
      'purchase',
      'gift',
      'package_purchase',
      'package_gift',
      'premium_purchase',
      'admin_grant',
      'quest_reward'
    )
  );

commit;
