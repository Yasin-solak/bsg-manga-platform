-- ============================================
-- Pending content revision tracking
-- Date: 2026-02-14
-- ============================================

begin;

create table if not exists public.pending_content_revisions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('manga', 'chapter')),
  target_id uuid not null,
  fansub_id uuid references public.fansubs(id) on delete set null,
  requested_by uuid references public.users(id) on delete set null default public.current_public_user_id(),
  change_action text not null check (change_action in ('create', 'edit')),
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  review_note text
);

create index if not exists pending_content_revisions_status_created_idx
  on public.pending_content_revisions (status, created_at desc);

create index if not exists pending_content_revisions_target_status_created_idx
  on public.pending_content_revisions (target_type, target_id, status, created_at desc);

create index if not exists pending_content_revisions_fansub_status_created_idx
  on public.pending_content_revisions (fansub_id, status, created_at desc);

drop trigger if exists trg_pending_content_revisions_updated_at on public.pending_content_revisions;
create trigger trg_pending_content_revisions_updated_at
  before update on public.pending_content_revisions
  for each row
  execute function public.set_updated_at();

alter table public.pending_content_revisions enable row level security;

drop policy if exists pending_content_revisions_select_rule on public.pending_content_revisions;
create policy pending_content_revisions_select_rule
  on public.pending_content_revisions
  for select
  using (
    public.is_admin()
    or requested_by = public.current_public_user_id()
    or (fansub_id is not null and public.is_fansub_staff(fansub_id))
  );

drop policy if exists pending_content_revisions_insert_rule on public.pending_content_revisions;
create policy pending_content_revisions_insert_rule
  on public.pending_content_revisions
  for insert
  with check (
    status = 'pending'
    and (
      public.is_admin()
      or requested_by = public.current_public_user_id()
      or (fansub_id is not null and public.is_fansub_staff(fansub_id))
    )
  );

drop policy if exists pending_content_revisions_update_admin on public.pending_content_revisions;
create policy pending_content_revisions_update_admin
  on public.pending_content_revisions
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists pending_content_revisions_delete_admin on public.pending_content_revisions;
create policy pending_content_revisions_delete_admin
  on public.pending_content_revisions
  for delete
  using (public.is_admin());

grant select, insert, update on public.pending_content_revisions to authenticated;

create or replace function public.manga_revision_snapshot(p_row public.mangas)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'title', p_row.title,
    'slug', p_row.slug,
    'description', p_row.description,
    'status', p_row.status,
    'genres', coalesce(to_jsonb(p_row.genres), '[]'::jsonb),
    'cover_image_url', p_row.cover_image_url,
    'author', p_row.author,
    'artist', p_row.artist,
    'release_date', p_row.release_date,
    'original_lang', p_row.original_lang,
    'is_new', p_row.is_new
  );
$$;

create or replace function public.chapter_revision_snapshot(p_row public.chapters)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'manga_id', p_row.manga_id,
    'chapter_number', p_row.chapter_number,
    'title', p_row.title,
    'pages', coalesce(p_row.pages, '[]'::jsonb),
    'publish_at', p_row.publish_at
  );
$$;

create or replace function public.capture_pending_manga_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_approved, false) = false then
      insert into public.pending_content_revisions (
        target_type,
        target_id,
        fansub_id,
        requested_by,
        change_action,
        before_data,
        after_data,
        status
      ) values (
        'manga',
        new.id,
        new.fansub_id,
        v_actor_id,
        'create',
        '{}'::jsonb,
        public.manga_revision_snapshot(new),
        'pending'
      );
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.is_approved, false) = false and coalesce(new.is_approved, false) = true then
      update public.pending_content_revisions
      set
        status = 'approved',
        reviewed_at = now(),
        reviewed_by = coalesce(v_actor_id, reviewed_by)
      where target_type = 'manga'
        and target_id = new.id
        and status = 'pending';

      return new;
    end if;

    if coalesce(new.is_approved, false) = false
      and (
        old.title is distinct from new.title
        or old.slug is distinct from new.slug
        or old.description is distinct from new.description
        or old.status is distinct from new.status
        or old.genres is distinct from new.genres
        or old.cover_image_url is distinct from new.cover_image_url
        or old.author is distinct from new.author
        or old.artist is distinct from new.artist
        or old.release_date is distinct from new.release_date
        or old.original_lang is distinct from new.original_lang
        or old.is_new is distinct from new.is_new
      )
    then
      insert into public.pending_content_revisions (
        target_type,
        target_id,
        fansub_id,
        requested_by,
        change_action,
        before_data,
        after_data,
        status
      ) values (
        'manga',
        new.id,
        new.fansub_id,
        v_actor_id,
        'edit',
        public.manga_revision_snapshot(old),
        public.manga_revision_snapshot(new),
        'pending'
      );
    end if;

    return new;
  end if;

  return new;
end;
$$;

create or replace function public.capture_pending_chapter_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_approved, false) = false then
      insert into public.pending_content_revisions (
        target_type,
        target_id,
        fansub_id,
        requested_by,
        change_action,
        before_data,
        after_data,
        status
      ) values (
        'chapter',
        new.id,
        new.fansub_id,
        v_actor_id,
        'create',
        '{}'::jsonb,
        public.chapter_revision_snapshot(new),
        'pending'
      );
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.is_approved, false) = false and coalesce(new.is_approved, false) = true then
      update public.pending_content_revisions
      set
        status = 'approved',
        reviewed_at = now(),
        reviewed_by = coalesce(v_actor_id, reviewed_by)
      where target_type = 'chapter'
        and target_id = new.id
        and status = 'pending';

      return new;
    end if;

    if coalesce(new.is_approved, false) = false
      and (
        old.manga_id is distinct from new.manga_id
        or old.chapter_number is distinct from new.chapter_number
        or old.title is distinct from new.title
        or old.pages is distinct from new.pages
        or old.publish_at is distinct from new.publish_at
      )
    then
      insert into public.pending_content_revisions (
        target_type,
        target_id,
        fansub_id,
        requested_by,
        change_action,
        before_data,
        after_data,
        status
      ) values (
        'chapter',
        new.id,
        new.fansub_id,
        v_actor_id,
        'edit',
        public.chapter_revision_snapshot(old),
        public.chapter_revision_snapshot(new),
        'pending'
      );
    end if;

    return new;
  end if;

  return new;
end;
$$;

create or replace function public.resolve_pending_revision_on_manga_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
begin
  update public.pending_content_revisions
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = coalesce(v_actor_id, reviewed_by)
  where target_type = 'manga'
    and target_id = old.id
    and status = 'pending';
  return old;
end;
$$;

create or replace function public.resolve_pending_revision_on_chapter_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
begin
  update public.pending_content_revisions
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = coalesce(v_actor_id, reviewed_by)
  where target_type = 'chapter'
    and target_id = old.id
    and status = 'pending';
  return old;
end;
$$;

drop trigger if exists trg_capture_pending_manga_revision on public.mangas;
create trigger trg_capture_pending_manga_revision
  after insert or update on public.mangas
  for each row
  execute function public.capture_pending_manga_revision();

drop trigger if exists trg_capture_pending_chapter_revision on public.chapters;
create trigger trg_capture_pending_chapter_revision
  after insert or update on public.chapters
  for each row
  execute function public.capture_pending_chapter_revision();

drop trigger if exists trg_resolve_pending_manga_revision_delete on public.mangas;
create trigger trg_resolve_pending_manga_revision_delete
  before delete on public.mangas
  for each row
  execute function public.resolve_pending_revision_on_manga_delete();

drop trigger if exists trg_resolve_pending_chapter_revision_delete on public.chapters;
create trigger trg_resolve_pending_chapter_revision_delete
  before delete on public.chapters
  for each row
  execute function public.resolve_pending_revision_on_chapter_delete();

commit;
