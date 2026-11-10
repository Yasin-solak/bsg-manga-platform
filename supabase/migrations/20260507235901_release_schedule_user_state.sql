-- ============================================
-- Release schedule user state
-- Date: 2026-05-07
-- ============================================

begin;

create table if not exists public.release_schedule_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  target_kind text not null
    check (target_kind in ('chapter', 'next_chapter')),
  target_id uuid not null,
  manga_id uuid not null references public.mangas(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  reminder_text text not null default ''
    check (char_length(reminder_text) <= 240),
  notification_due_at timestamptz,
  notification_status text not null default 'queued'
    check (notification_status in ('queued', 'sent', 'cancelled')),
  last_notified_chapter_id uuid references public.chapters(id) on delete set null,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_kind, target_id),
  check (
    (
      target_kind = 'chapter'
      and chapter_id is not null
      and target_id = chapter_id
      and notification_due_at is not null
    )
    or (
      target_kind = 'next_chapter'
      and chapter_id is null
      and target_id = manga_id
    )
  )
);

create index if not exists release_schedule_reminders_user_created_idx
  on public.release_schedule_reminders (user_id, created_at desc);

create index if not exists release_schedule_reminders_manga_status_idx
  on public.release_schedule_reminders (manga_id, target_kind, notification_status);

create index if not exists release_schedule_reminders_due_idx
  on public.release_schedule_reminders (notification_due_at)
  where notification_status = 'queued' and notification_due_at is not null;

drop trigger if exists trg_release_schedule_reminders_updated_at on public.release_schedule_reminders;
create trigger trg_release_schedule_reminders_updated_at
  before update on public.release_schedule_reminders
  for each row
  execute function public.set_updated_at();

alter table public.release_schedule_reminders enable row level security;

drop policy if exists release_schedule_reminders_select_own_or_admin on public.release_schedule_reminders;
create policy release_schedule_reminders_select_own_or_admin
  on public.release_schedule_reminders
  for select
  to authenticated
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists release_schedule_reminders_insert_own_or_admin on public.release_schedule_reminders;
create policy release_schedule_reminders_insert_own_or_admin
  on public.release_schedule_reminders
  for insert
  to authenticated
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists release_schedule_reminders_update_own_or_admin on public.release_schedule_reminders;
create policy release_schedule_reminders_update_own_or_admin
  on public.release_schedule_reminders
  for update
  to authenticated
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists release_schedule_reminders_delete_own_or_admin on public.release_schedule_reminders;
create policy release_schedule_reminders_delete_own_or_admin
  on public.release_schedule_reminders
  for delete
  to authenticated
  using (user_id = public.current_public_user_id() or public.is_admin());

revoke all on table public.release_schedule_reminders from anon;
grant select, insert, update, delete on table public.release_schedule_reminders to authenticated;

create table if not exists public.user_reading_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  manga_id uuid not null references public.mangas(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  source text not null default 'release_schedule'
    check (source in ('release_schedule', 'profile', 'manual')),
  status text not null default 'planned'
    check (status in ('planned', 'done', 'skipped')),
  release_publish_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, chapter_id)
);

create index if not exists user_reading_plan_items_user_status_idx
  on public.user_reading_plan_items (user_id, status, release_publish_at asc nulls last, created_at desc);

create index if not exists user_reading_plan_items_manga_idx
  on public.user_reading_plan_items (manga_id, user_id);

drop trigger if exists trg_user_reading_plan_items_updated_at on public.user_reading_plan_items;
create trigger trg_user_reading_plan_items_updated_at
  before update on public.user_reading_plan_items
  for each row
  execute function public.set_updated_at();

alter table public.user_reading_plan_items enable row level security;

drop policy if exists user_reading_plan_items_select_own_or_admin on public.user_reading_plan_items;
create policy user_reading_plan_items_select_own_or_admin
  on public.user_reading_plan_items
  for select
  to authenticated
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_reading_plan_items_insert_own_or_admin on public.user_reading_plan_items;
create policy user_reading_plan_items_insert_own_or_admin
  on public.user_reading_plan_items
  for insert
  to authenticated
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_reading_plan_items_update_own_or_admin on public.user_reading_plan_items;
create policy user_reading_plan_items_update_own_or_admin
  on public.user_reading_plan_items
  for update
  to authenticated
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_reading_plan_items_delete_own_or_admin on public.user_reading_plan_items;
create policy user_reading_plan_items_delete_own_or_admin
  on public.user_reading_plan_items
  for delete
  to authenticated
  using (user_id = public.current_public_user_id() or public.is_admin());

revoke all on table public.user_reading_plan_items from anon;
grant select, insert, update, delete on table public.user_reading_plan_items to authenticated;

commit;
