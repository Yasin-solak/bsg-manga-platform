-- Reported content -> fansub fix loop: schema foundation.
--
-- Goal: a user reports content (manga, manga chapter or community post);
-- if the site admin agrees and removes the content, a "to fix" record must land on the
-- owning fansub and the fansub admin must fix the content and resend it
-- for review.
--
-- This migration:
-- 1) adds 'manga' and 'chapter' to reports.target_type (not only COMMENTS, the content
-- itself can be reported too). NOTE: different fansubs upload the same chapter as SEPARATE chapters
-- rows; a report always targets one chapters.id (one fansub_id),
-- so fansub assignment does not mix.
-- 2) sets up the fansub_reported_content table (the fansub fix queue).
-- 3) adds triggers closing the open fix record when the content is reapproved.
--
-- RPCs are in migration 242.

begin;

-- 1) Rapor hedef tiplerini genislet ------------------------------------------
alter table public.reports
  drop constraint if exists reports_target_type_check;

alter table public.reports
  add constraint reports_target_type_check
  check (target_type in (
    'post', 'comment', 'manga_comment', 'manga_list_comment', 'user',
    'manga', 'chapter'
  ));

-- 2) Fansub fix queue --------------------------------------------------
create table if not exists public.fansub_reported_content (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  target_type text not null check (target_type in ('manga', 'chapter', 'post')),
  target_id uuid not null,
  report_id uuid references public.reports(id) on delete set null,
  reason text,
  admin_note text,
  status text not null default 'awaiting_fix'
    check (status in ('awaiting_fix', 'fix_submitted', 'resolved', 'dismissed')),
  removed_by uuid references public.users(id) on delete set null,
  removed_at timestamptz not null default now(),
  fix_note text,
  fixed_by uuid references public.users(id) on delete set null,
  fixed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One content can have only one OPEN fix record at a time.
create unique index if not exists fansub_reported_content_open_unique
  on public.fansub_reported_content (target_type, target_id)
  where status in ('awaiting_fix', 'fix_submitted');

create index if not exists fansub_reported_content_fansub_status_idx
  on public.fansub_reported_content (fansub_id, status, removed_at desc);

create index if not exists fansub_reported_content_report_idx
  on public.fansub_reported_content (report_id);

drop trigger if exists trg_fansub_reported_content_updated_at on public.fansub_reported_content;
create trigger trg_fansub_reported_content_updated_at
  before update on public.fansub_reported_content
  for each row
  execute function public.set_updated_at();

alter table public.fansub_reported_content enable row level security;

-- Read: site admin or the related fansub team. Writes only with security-definer RPCs.
drop policy if exists fansub_reported_content_select_rule on public.fansub_reported_content;
create policy fansub_reported_content_select_rule
  on public.fansub_reported_content
  for select
  using (
    public.is_admin()
    or public.is_fansub_staff(fansub_id)
  );

grant select on public.fansub_reported_content to authenticated;

-- 3) Close the open fix record when content is reapproved -------------------
-- Manga/chapter: is_approved false->true. Post: status -> 'approved'.

create or replace function public.close_fansub_fix_on_manga_reapprove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.is_approved, false) = false and coalesce(new.is_approved, false) = true then
    update public.fansub_reported_content
    set status = 'resolved', resolved_at = now()
    where target_type = 'manga'
      and target_id = new.id
      and status in ('awaiting_fix', 'fix_submitted');
  end if;
  return new;
end;
$$;

create or replace function public.close_fansub_fix_on_chapter_reapprove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.is_approved, false) = false and coalesce(new.is_approved, false) = true then
    update public.fansub_reported_content
    set status = 'resolved', resolved_at = now()
    where target_type = 'chapter'
      and target_id = new.id
      and status in ('awaiting_fix', 'fix_submitted');
  end if;
  return new;
end;
$$;

create or replace function public.close_fansub_fix_on_post_reapprove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.status, '') <> 'approved' and new.status = 'approved' then
    update public.fansub_reported_content
    set status = 'resolved', resolved_at = now()
    where target_type = 'post'
      and target_id = new.id
      and status in ('awaiting_fix', 'fix_submitted');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_close_fansub_fix_manga on public.mangas;
create trigger trg_close_fansub_fix_manga
  after update on public.mangas
  for each row
  execute function public.close_fansub_fix_on_manga_reapprove();

drop trigger if exists trg_close_fansub_fix_chapter on public.chapters;
create trigger trg_close_fansub_fix_chapter
  after update on public.chapters
  for each row
  execute function public.close_fansub_fix_on_chapter_reapprove();

drop trigger if exists trg_close_fansub_fix_post on public.community_posts;
create trigger trg_close_fansub_fix_post
  after update on public.community_posts
  for each row
  execute function public.close_fansub_fix_on_post_reapprove();

commit;
