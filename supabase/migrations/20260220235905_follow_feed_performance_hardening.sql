-- ============================================
-- BSG Manga | Follow Feed Performance Hardening
-- Date: 2026-02-20
-- - Denormalized activity_events feed source
-- - Trigger-based event capture
-- - Follow feed RPC rewrite + retention helper
-- ============================================

begin;

create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  event_type text not null
    check (event_type in ('user_read', 'user_comment', 'fansub_new_chapter', 'fansub_new_manga', 'fansub_post')),
  actor_type text not null
    check (actor_type in ('user', 'fansub')),
  actor_user_id uuid references public.users(id) on delete cascade,
  actor_fansub_id uuid references public.fansubs(id) on delete cascade,
  actor_name text,
  actor_username text,
  actor_avatar_url text,
  actor_frame_type text,
  manga_id uuid references public.mangas(id) on delete set null,
  manga_title text,
  manga_cover_image_url text,
  chapter_id uuid references public.chapters(id) on delete set null,
  chapter_number numeric,
  post_id uuid references public.community_posts(id) on delete set null,
  comment_id uuid references public.manga_comments(id) on delete set null,
  route_hint text,
  summary text not null default '',
  source_type text not null
    check (source_type in ('reading_history', 'manga_comments', 'chapters', 'mangas', 'community_posts')),
  source_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  inserted_at timestamptz not null default now(),
  is_active boolean not null default true,
  check (
    (actor_type = 'user' and actor_user_id is not null and actor_fansub_id is null)
    or (actor_type = 'fansub' and actor_fansub_id is not null and actor_user_id is null)
  )
);

create index if not exists activity_events_created_idx
  on public.activity_events (created_at desc, event_key desc)
  where is_active = true;

create index if not exists activity_events_actor_user_feed_idx
  on public.activity_events (actor_user_id, created_at desc, event_key desc)
  where is_active = true and actor_type = 'user' and actor_user_id is not null;

create index if not exists activity_events_actor_fansub_feed_idx
  on public.activity_events (actor_fansub_id, created_at desc, event_key desc)
  where is_active = true and actor_type = 'fansub' and actor_fansub_id is not null;

create index if not exists activity_events_source_idx
  on public.activity_events (source_type, source_id);

create unique index if not exists activity_events_single_source_event_idx
  on public.activity_events (source_type, source_id, event_type)
  where source_type in ('manga_comments', 'chapters', 'mangas', 'community_posts');

alter table public.activity_events enable row level security;
revoke all on public.activity_events from anon, authenticated;

create or replace function public.upsert_activity_event(
  p_event_key text,
  p_event_type text,
  p_actor_type text,
  p_actor_user_id uuid default null,
  p_actor_fansub_id uuid default null,
  p_actor_name text default null,
  p_actor_username text default null,
  p_actor_avatar_url text default null,
  p_actor_frame_type text default null,
  p_manga_id uuid default null,
  p_manga_title text default null,
  p_manga_cover_image_url text default null,
  p_chapter_id uuid default null,
  p_chapter_number numeric default null,
  p_post_id uuid default null,
  p_comment_id uuid default null,
  p_route_hint text default null,
  p_summary text default '',
  p_source_type text default '',
  p_source_id uuid default null,
  p_created_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb,
  p_is_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(p_event_key, '')), '') is null then
    return;
  end if;

  if p_source_id is null then
    return;
  end if;

  insert into public.activity_events (
    event_key,
    event_type,
    actor_type,
    actor_user_id,
    actor_fansub_id,
    actor_name,
    actor_username,
    actor_avatar_url,
    actor_frame_type,
    manga_id,
    manga_title,
    manga_cover_image_url,
    chapter_id,
    chapter_number,
    post_id,
    comment_id,
    route_hint,
    summary,
    source_type,
    source_id,
    metadata,
    created_at,
    is_active
  )
  values (
    p_event_key,
    p_event_type,
    p_actor_type,
    p_actor_user_id,
    p_actor_fansub_id,
    p_actor_name,
    p_actor_username,
    p_actor_avatar_url,
    p_actor_frame_type,
    p_manga_id,
    p_manga_title,
    p_manga_cover_image_url,
    p_chapter_id,
    p_chapter_number,
    p_post_id,
    p_comment_id,
    p_route_hint,
    left(coalesce(p_summary, ''), 280),
    p_source_type,
    p_source_id,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_created_at, now()),
    coalesce(p_is_active, true)
  )
  on conflict (event_key) do update
  set
    actor_name = excluded.actor_name,
    actor_username = excluded.actor_username,
    actor_avatar_url = excluded.actor_avatar_url,
    actor_frame_type = excluded.actor_frame_type,
    manga_id = excluded.manga_id,
    manga_title = excluded.manga_title,
    manga_cover_image_url = excluded.manga_cover_image_url,
    chapter_id = excluded.chapter_id,
    chapter_number = excluded.chapter_number,
    post_id = excluded.post_id,
    comment_id = excluded.comment_id,
    route_hint = excluded.route_hint,
    summary = excluded.summary,
    metadata = coalesce(public.activity_events.metadata, '{}'::jsonb) || excluded.metadata,
    created_at = excluded.created_at,
    is_active = excluded.is_active;
exception
  when others then
    raise notice 'upsert_activity_event skipped: %', sqlerrm;
end;
$$;

revoke all on function public.upsert_activity_event(
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  uuid,
  numeric,
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  timestamptz,
  jsonb,
  boolean
) from public;

create or replace function public.capture_user_read_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_avatar_url text;
  v_frame_type text;
  v_manga_title text;
  v_manga_cover text;
  v_chapter_number numeric;
  v_route_hint text;
  v_summary text;
  v_event_key text;
begin
  if new.user_id is null or new.manga_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.read_at is not null
       and new.read_at is not null
       and new.chapter_id is not distinct from old.chapter_id
       and new.chapter_number is not distinct from old.chapter_number
       and new.read_at <= old.read_at + interval '3 minutes' then
      return new;
    end if;
  end if;

  select u.username, u.avatar_url, u.frame_type
  into v_username, v_avatar_url, v_frame_type
  from public.users u
  where u.id = new.user_id
    and u.is_active = true;

  if v_username is null then
    return new;
  end if;

  select m.title, m.cover_image_url
  into v_manga_title, v_manga_cover
  from public.mangas m
  where m.id = new.manga_id
    and m.is_active = true
    and m.is_approved = true;

  if v_manga_title is null then
    return new;
  end if;

  v_chapter_number := new.chapter_number;

  if v_chapter_number is null and new.chapter_id is not null then
    select c.chapter_number
    into v_chapter_number
    from public.chapters c
    where c.id = new.chapter_id;
  end if;

  if v_chapter_number is not null then
    v_route_hint := format('/manga/%s/chapter/%s', new.manga_id::text, v_chapter_number::text);
    v_summary := format(
      '%s, %s mangasinda %s. bolumu okudu.',
      coalesce(v_username, 'Bir kullanici'),
      coalesce(v_manga_title, 'Manga'),
      coalesce(v_chapter_number::text, '?')
    );
  else
    v_route_hint := format('/manga/%s', new.manga_id::text);
    v_summary := format(
      '%s, %s mangasini okudu.',
      coalesce(v_username, 'Bir kullanici'),
      coalesce(v_manga_title, 'Manga')
    );
  end if;

  v_event_key := format(
    'user-read:%s:%s',
    new.id::text,
    to_char(coalesce(new.read_at, now()) at time zone 'UTC', 'YYYYMMDDHH24MISSUS')
  );

  perform public.upsert_activity_event(
    p_event_key => v_event_key,
    p_event_type => 'user_read',
    p_actor_type => 'user',
    p_actor_user_id => new.user_id,
    p_actor_name => v_username,
    p_actor_username => v_username,
    p_actor_avatar_url => v_avatar_url,
    p_actor_frame_type => v_frame_type,
    p_manga_id => new.manga_id,
    p_manga_title => v_manga_title,
    p_manga_cover_image_url => v_manga_cover,
    p_chapter_id => new.chapter_id,
    p_chapter_number => v_chapter_number,
    p_route_hint => v_route_hint,
    p_summary => v_summary,
    p_source_type => 'reading_history',
    p_source_id => new.id,
    p_created_at => coalesce(new.read_at, now()),
    p_metadata => jsonb_build_object('source', 'track_manga_read'),
    p_is_active => true
  );

  return new;
end;
$$;

revoke all on function public.capture_user_read_activity_event() from public;

drop trigger if exists trg_capture_user_read_activity_event on public.reading_history;
create trigger trg_capture_user_read_activity_event
after insert or update of read_at, chapter_id, chapter_number on public.reading_history
for each row
execute function public.capture_user_read_activity_event();

create or replace function public.capture_user_comment_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_avatar_url text;
  v_frame_type text;
  v_manga_title text;
  v_manga_cover text;
  v_chapter_number numeric;
  v_route_hint text;
  v_summary text;
begin
  if tg_op = 'UPDATE' and coalesce(new.is_active, true) = false then
    update public.activity_events ae
    set is_active = false
    where ae.event_key = ('user-comment:' || new.id::text);

    return new;
  end if;

  if coalesce(new.is_active, true) = false then
    return new;
  end if;

  select u.username, u.avatar_url, u.frame_type
  into v_username, v_avatar_url, v_frame_type
  from public.users u
  where u.id = new.user_id
    and u.is_active = true;

  if v_username is null then
    return new;
  end if;

  select m.title, m.cover_image_url
  into v_manga_title, v_manga_cover
  from public.mangas m
  where m.id = new.manga_id
    and m.is_active = true
    and m.is_approved = true;

  if v_manga_title is null then
    return new;
  end if;

  if new.chapter_id is not null then
    select c.chapter_number
    into v_chapter_number
    from public.chapters c
    where c.id = new.chapter_id
      and c.is_active = true
      and c.is_approved = true
      and (c.publish_at is null or c.publish_at <= now());
  else
    v_chapter_number := null;
  end if;

  if v_chapter_number is not null then
    v_route_hint := format('/manga/%s/chapter/%s', new.manga_id::text, v_chapter_number::text);
    v_summary := format(
      '%s, %s mangasinda %s. bolume yorum yapti.',
      coalesce(v_username, 'Bir kullanici'),
      coalesce(v_manga_title, 'Manga'),
      coalesce(v_chapter_number::text, '?')
    );
  else
    v_route_hint := format('/manga/%s', new.manga_id::text);
    v_summary := format(
      '%s, %s mangasina yorum yapti.',
      coalesce(v_username, 'Bir kullanici'),
      coalesce(v_manga_title, 'Manga')
    );
  end if;

  perform public.upsert_activity_event(
    p_event_key => ('user-comment:' || new.id::text),
    p_event_type => 'user_comment',
    p_actor_type => 'user',
    p_actor_user_id => new.user_id,
    p_actor_name => v_username,
    p_actor_username => v_username,
    p_actor_avatar_url => v_avatar_url,
    p_actor_frame_type => v_frame_type,
    p_manga_id => new.manga_id,
    p_manga_title => v_manga_title,
    p_manga_cover_image_url => v_manga_cover,
    p_chapter_id => new.chapter_id,
    p_chapter_number => v_chapter_number,
    p_comment_id => new.id,
    p_route_hint => v_route_hint,
    p_summary => v_summary,
    p_source_type => 'manga_comments',
    p_source_id => new.id,
    p_created_at => new.created_at,
    p_metadata => jsonb_build_object('is_reply', new.parent_id is not null),
    p_is_active => true
  );

  return new;
end;
$$;

revoke all on function public.capture_user_comment_activity_event() from public;

drop trigger if exists trg_capture_user_comment_activity_event on public.manga_comments;
create trigger trg_capture_user_comment_activity_event
after insert or update of is_active on public.manga_comments
for each row
execute function public.capture_user_comment_activity_event();

create or replace function public.capture_fansub_chapter_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_visible boolean;
  v_fansub_id uuid;
  v_fansub_name text;
  v_fansub_slug text;
  v_fansub_avatar text;
  v_fansub_frame text;
  v_manga_title text;
  v_manga_cover text;
  v_summary text;
begin
  v_is_visible :=
    coalesce(new.is_active, false) = true
    and coalesce(new.is_approved, false) = true
    and coalesce(new.publish_at, now()) <= now();

  if not v_is_visible then
    update public.activity_events ae
    set is_active = false
    where ae.event_key = ('fansub-chapter:' || new.id::text);

    return new;
  end if;

  select
    coalesce(new.fansub_id, m.fansub_id),
    m.title,
    m.cover_image_url
  into v_fansub_id, v_manga_title, v_manga_cover
  from public.mangas m
  where m.id = new.manga_id
    and m.is_active = true
    and m.is_approved = true;

  if v_fansub_id is null or v_manga_title is null then
    return new;
  end if;

  select f.name, f.slug, f.avatar_url, f.frame_type
  into v_fansub_name, v_fansub_slug, v_fansub_avatar, v_fansub_frame
  from public.fansubs f
  where f.id = v_fansub_id
    and f.is_active = true;

  if v_fansub_name is null then
    return new;
  end if;

  v_summary := format(
    '%s, %s mangasina %s. bolumu ekledi.',
    coalesce(v_fansub_name, 'Bir fansub'),
    coalesce(v_manga_title, 'Manga'),
    coalesce(new.chapter_number::text, '?')
  );

  perform public.upsert_activity_event(
    p_event_key => ('fansub-chapter:' || new.id::text),
    p_event_type => 'fansub_new_chapter',
    p_actor_type => 'fansub',
    p_actor_fansub_id => v_fansub_id,
    p_actor_name => v_fansub_name,
    p_actor_username => v_fansub_slug,
    p_actor_avatar_url => v_fansub_avatar,
    p_actor_frame_type => v_fansub_frame,
    p_manga_id => new.manga_id,
    p_manga_title => v_manga_title,
    p_manga_cover_image_url => v_manga_cover,
    p_chapter_id => new.id,
    p_chapter_number => new.chapter_number,
    p_route_hint => format('/manga/%s/chapter/%s', new.manga_id::text, new.chapter_number::text),
    p_summary => v_summary,
    p_source_type => 'chapters',
    p_source_id => new.id,
    p_created_at => coalesce(new.publish_at, new.created_at, now()),
    p_metadata => jsonb_build_object('publish_at', coalesce(new.publish_at, new.created_at, now())),
    p_is_active => true
  );

  return new;
end;
$$;

revoke all on function public.capture_fansub_chapter_activity_event() from public;

drop trigger if exists trg_capture_fansub_chapter_activity_event on public.chapters;
create trigger trg_capture_fansub_chapter_activity_event
after insert or update of is_approved, is_active, publish_at, chapter_number, manga_id, fansub_id on public.chapters
for each row
execute function public.capture_fansub_chapter_activity_event();

create or replace function public.capture_fansub_manga_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_visible boolean;
  v_fansub_name text;
  v_fansub_slug text;
  v_fansub_avatar text;
  v_fansub_frame text;
  v_summary text;
begin
  v_is_visible :=
    new.fansub_id is not null
    and coalesce(new.is_active, false) = true
    and coalesce(new.is_approved, false) = true;

  if not v_is_visible then
    update public.activity_events ae
    set is_active = false
    where ae.event_key = ('fansub-manga:' || new.id::text);

    return new;
  end if;

  select f.name, f.slug, f.avatar_url, f.frame_type
  into v_fansub_name, v_fansub_slug, v_fansub_avatar, v_fansub_frame
  from public.fansubs f
  where f.id = new.fansub_id
    and f.is_active = true;

  if v_fansub_name is null then
    return new;
  end if;

  v_summary := format(
    '%s, yeni manga ekledi: %s.',
    coalesce(v_fansub_name, 'Bir fansub'),
    coalesce(new.title, 'Manga')
  );

  perform public.upsert_activity_event(
    p_event_key => ('fansub-manga:' || new.id::text),
    p_event_type => 'fansub_new_manga',
    p_actor_type => 'fansub',
    p_actor_fansub_id => new.fansub_id,
    p_actor_name => v_fansub_name,
    p_actor_username => v_fansub_slug,
    p_actor_avatar_url => v_fansub_avatar,
    p_actor_frame_type => v_fansub_frame,
    p_manga_id => new.id,
    p_manga_title => new.title,
    p_manga_cover_image_url => new.cover_image_url,
    p_route_hint => format('/manga/%s', new.id::text),
    p_summary => v_summary,
    p_source_type => 'mangas',
    p_source_id => new.id,
    p_created_at => coalesce(new.created_at, now()),
    p_metadata => jsonb_build_object('is_new', coalesce(new.is_new, false)),
    p_is_active => true
  );

  return new;
end;
$$;

revoke all on function public.capture_fansub_manga_activity_event() from public;

drop trigger if exists trg_capture_fansub_manga_activity_event on public.mangas;
create trigger trg_capture_fansub_manga_activity_event
after insert or update of is_approved, is_active, title, fansub_id, cover_image_url on public.mangas
for each row
execute function public.capture_fansub_manga_activity_event();

create or replace function public.capture_fansub_post_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_visible boolean;
  v_fansub_name text;
  v_fansub_slug text;
  v_fansub_avatar text;
  v_fansub_frame text;
  v_manga_title text;
  v_manga_cover text;
  v_post_title text;
  v_summary text;
begin
  v_is_visible :=
    new.related_fansub_id is not null
    and coalesce(new.is_active, false) = true
    and new.status = 'approved'
    and lower(btrim(coalesce(new.category, ''))) <> 'duyuru';

  if not v_is_visible then
    update public.activity_events ae
    set is_active = false
    where ae.event_key = ('fansub-post:' || new.id::text);

    return new;
  end if;

  select f.name, f.slug, f.avatar_url, f.frame_type
  into v_fansub_name, v_fansub_slug, v_fansub_avatar, v_fansub_frame
  from public.fansubs f
  where f.id = new.related_fansub_id
    and f.is_active = true;

  if v_fansub_name is null then
    return new;
  end if;

  if new.related_manga_id is not null then
    select m.title, m.cover_image_url
    into v_manga_title, v_manga_cover
    from public.mangas m
    where m.id = new.related_manga_id
      and m.is_active = true
      and m.is_approved = true;
  else
    v_manga_title := null;
    v_manga_cover := null;
  end if;

  v_post_title := coalesce(nullif(trim(coalesce(new.title, '')), ''), 'Topluluk gonderisi');
  v_summary := format(
    '%s, toplulukta yeni bir paylasim yapti.',
    coalesce(v_fansub_name, 'Bir fansub')
  );

  perform public.upsert_activity_event(
    p_event_key => ('fansub-post:' || new.id::text),
    p_event_type => 'fansub_post',
    p_actor_type => 'fansub',
    p_actor_fansub_id => new.related_fansub_id,
    p_actor_name => v_fansub_name,
    p_actor_username => v_fansub_slug,
    p_actor_avatar_url => v_fansub_avatar,
    p_actor_frame_type => v_fansub_frame,
    p_manga_id => new.related_manga_id,
    p_manga_title => v_manga_title,
    p_manga_cover_image_url => v_manga_cover,
    p_post_id => new.id,
    p_route_hint => format('/discussion/%s', new.id::text),
    p_summary => v_summary,
    p_source_type => 'community_posts',
    p_source_id => new.id,
    p_created_at => new.created_at,
    p_metadata => jsonb_build_object('post_title', v_post_title, 'category', new.category),
    p_is_active => true
  );

  return new;
end;
$$;

revoke all on function public.capture_fansub_post_activity_event() from public;

drop trigger if exists trg_capture_fansub_post_activity_event on public.community_posts;
create trigger trg_capture_fansub_post_activity_event
after insert or update of status, is_active, title, category, related_fansub_id, related_manga_id on public.community_posts
for each row
execute function public.capture_fansub_post_activity_event();

insert into public.activity_events (
  event_key,
  event_type,
  actor_type,
  actor_user_id,
  actor_name,
  actor_username,
  actor_avatar_url,
  actor_frame_type,
  manga_id,
  manga_title,
  manga_cover_image_url,
  chapter_id,
  chapter_number,
  route_hint,
  summary,
  source_type,
  source_id,
  metadata,
  created_at,
  is_active
)
select
  format(
    'user-read:%s:%s',
    rh.id::text,
    to_char(rh.read_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS')
  ) as event_key,
  'user_read'::text as event_type,
  'user'::text as actor_type,
  u.id as actor_user_id,
  u.username as actor_name,
  u.username as actor_username,
  u.avatar_url as actor_avatar_url,
  u.frame_type as actor_frame_type,
  m.id as manga_id,
  m.title as manga_title,
  m.cover_image_url as manga_cover_image_url,
  rh.chapter_id,
  coalesce(rh.chapter_number, c.chapter_number) as chapter_number,
  case
    when coalesce(rh.chapter_number, c.chapter_number) is not null
      then format('/manga/%s/chapter/%s', rh.manga_id::text, coalesce(rh.chapter_number, c.chapter_number)::text)
    else format('/manga/%s', rh.manga_id::text)
  end as route_hint,
  case
    when coalesce(rh.chapter_number, c.chapter_number) is not null
      then format('%s, %s mangasinda %s. bolumu okudu.', u.username, m.title, coalesce(rh.chapter_number, c.chapter_number)::text)
    else format('%s, %s mangasini okudu.', u.username, m.title)
  end as summary,
  'reading_history'::text as source_type,
  rh.id as source_id,
  jsonb_build_object('backfill', true) as metadata,
  rh.read_at as created_at,
  true as is_active
from (
  select rh.*
  from public.reading_history rh
  where rh.read_at >= now() - interval '60 days'
  order by rh.read_at desc
  limit 6000
) rh
join public.users u
  on u.id = rh.user_id
 and u.is_active = true
join public.mangas m
  on m.id = rh.manga_id
 and m.is_active = true
 and m.is_approved = true
left join public.chapters c
  on c.id = rh.chapter_id
on conflict (event_key) do nothing;

insert into public.activity_events (
  event_key,
  event_type,
  actor_type,
  actor_user_id,
  actor_name,
  actor_username,
  actor_avatar_url,
  actor_frame_type,
  manga_id,
  manga_title,
  manga_cover_image_url,
  chapter_id,
  chapter_number,
  comment_id,
  route_hint,
  summary,
  source_type,
  source_id,
  metadata,
  created_at,
  is_active
)
select
  ('user-comment:' || mc.id::text) as event_key,
  'user_comment'::text as event_type,
  'user'::text as actor_type,
  u.id as actor_user_id,
  u.username as actor_name,
  u.username as actor_username,
  u.avatar_url as actor_avatar_url,
  u.frame_type as actor_frame_type,
  m.id as manga_id,
  m.title as manga_title,
  m.cover_image_url as manga_cover_image_url,
  mc.chapter_id,
  c.chapter_number,
  mc.id as comment_id,
  case
    when c.chapter_number is not null then format('/manga/%s/chapter/%s', mc.manga_id::text, c.chapter_number::text)
    else format('/manga/%s', mc.manga_id::text)
  end as route_hint,
  case
    when c.chapter_number is not null then format('%s, %s mangasinda %s. bolume yorum yapti.', u.username, m.title, c.chapter_number::text)
    else format('%s, %s mangasina yorum yapti.', u.username, m.title)
  end as summary,
  'manga_comments'::text as source_type,
  mc.id as source_id,
  jsonb_build_object('backfill', true, 'is_reply', mc.parent_id is not null) as metadata,
  mc.created_at as created_at,
  true as is_active
from (
  select mc.*
  from public.manga_comments mc
  where mc.is_active = true
    and mc.created_at >= now() - interval '60 days'
  order by mc.created_at desc
  limit 6000
) mc
join public.users u
  on u.id = mc.user_id
 and u.is_active = true
join public.mangas m
  on m.id = mc.manga_id
 and m.is_active = true
 and m.is_approved = true
left join public.chapters c
  on c.id = mc.chapter_id
 and c.is_active = true
 and c.is_approved = true
 and (c.publish_at is null or c.publish_at <= now())
on conflict (event_key) do nothing;

insert into public.activity_events (
  event_key,
  event_type,
  actor_type,
  actor_fansub_id,
  actor_name,
  actor_username,
  actor_avatar_url,
  actor_frame_type,
  manga_id,
  manga_title,
  manga_cover_image_url,
  chapter_id,
  chapter_number,
  route_hint,
  summary,
  source_type,
  source_id,
  metadata,
  created_at,
  is_active
)
select
  ('fansub-chapter:' || c.id::text) as event_key,
  'fansub_new_chapter'::text as event_type,
  'fansub'::text as actor_type,
  f.id as actor_fansub_id,
  f.name as actor_name,
  f.slug as actor_username,
  f.avatar_url as actor_avatar_url,
  f.frame_type as actor_frame_type,
  m.id as manga_id,
  m.title as manga_title,
  m.cover_image_url as manga_cover_image_url,
  c.id as chapter_id,
  c.chapter_number,
  format('/manga/%s/chapter/%s', m.id::text, c.chapter_number::text) as route_hint,
  format('%s, %s mangasina %s. bolumu ekledi.', f.name, m.title, c.chapter_number::text) as summary,
  'chapters'::text as source_type,
  c.id as source_id,
  jsonb_build_object('backfill', true) as metadata,
  coalesce(c.publish_at, c.created_at) as created_at,
  true as is_active
from (
  select c.*
  from public.chapters c
  where c.is_active = true
    and c.is_approved = true
    and coalesce(c.publish_at, c.created_at, now()) <= now()
    and coalesce(c.publish_at, c.created_at, now()) >= now() - interval '60 days'
  order by coalesce(c.publish_at, c.created_at) desc
  limit 6000
) c
join public.mangas m
  on m.id = c.manga_id
 and m.is_active = true
 and m.is_approved = true
join public.fansubs f
  on f.id = coalesce(c.fansub_id, m.fansub_id)
 and f.is_active = true
on conflict (event_key) do nothing;

insert into public.activity_events (
  event_key,
  event_type,
  actor_type,
  actor_fansub_id,
  actor_name,
  actor_username,
  actor_avatar_url,
  actor_frame_type,
  manga_id,
  manga_title,
  manga_cover_image_url,
  route_hint,
  summary,
  source_type,
  source_id,
  metadata,
  created_at,
  is_active
)
select
  ('fansub-manga:' || m.id::text) as event_key,
  'fansub_new_manga'::text as event_type,
  'fansub'::text as actor_type,
  f.id as actor_fansub_id,
  f.name as actor_name,
  f.slug as actor_username,
  f.avatar_url as actor_avatar_url,
  f.frame_type as actor_frame_type,
  m.id as manga_id,
  m.title as manga_title,
  m.cover_image_url as manga_cover_image_url,
  format('/manga/%s', m.id::text) as route_hint,
  format('%s, yeni manga ekledi: %s.', f.name, m.title) as summary,
  'mangas'::text as source_type,
  m.id as source_id,
  jsonb_build_object('backfill', true) as metadata,
  m.created_at as created_at,
  true as is_active
from (
  select m.*
  from public.mangas m
  where m.is_active = true
    and m.is_approved = true
    and m.fansub_id is not null
    and m.created_at >= now() - interval '60 days'
  order by m.created_at desc
  limit 6000
) m
join public.fansubs f
  on f.id = m.fansub_id
 and f.is_active = true
on conflict (event_key) do nothing;

insert into public.activity_events (
  event_key,
  event_type,
  actor_type,
  actor_fansub_id,
  actor_name,
  actor_username,
  actor_avatar_url,
  actor_frame_type,
  manga_id,
  manga_title,
  manga_cover_image_url,
  post_id,
  route_hint,
  summary,
  source_type,
  source_id,
  metadata,
  created_at,
  is_active
)
select
  ('fansub-post:' || cp.id::text) as event_key,
  'fansub_post'::text as event_type,
  'fansub'::text as actor_type,
  f.id as actor_fansub_id,
  f.name as actor_name,
  f.slug as actor_username,
  f.avatar_url as actor_avatar_url,
  f.frame_type as actor_frame_type,
  m.id as manga_id,
  m.title as manga_title,
  m.cover_image_url as manga_cover_image_url,
  cp.id as post_id,
  format('/discussion/%s', cp.id::text) as route_hint,
  format('%s, toplulukta yeni bir paylasim yapti.', f.name) as summary,
  'community_posts'::text as source_type,
  cp.id as source_id,
  jsonb_build_object('backfill', true, 'post_title', cp.title) as metadata,
  cp.created_at as created_at,
  true as is_active
from (
  select cp.*
  from public.community_posts cp
  where cp.is_active = true
    and cp.status = 'approved'
    and cp.related_fansub_id is not null
    and lower(btrim(coalesce(cp.category, ''))) <> 'duyuru'
    and cp.created_at >= now() - interval '60 days'
  order by cp.created_at desc
  limit 6000
) cp
join public.fansubs f
  on f.id = cp.related_fansub_id
 and f.is_active = true
left join public.mangas m
  on m.id = cp.related_manga_id
 and m.is_active = true
 and m.is_approved = true
on conflict (event_key) do nothing;

create or replace function public.get_followed_activity_feed(
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_event_key text default null
)
returns table (
  event_key text,
  event_type text,
  actor_type text,
  actor_user_id uuid,
  actor_fansub_id uuid,
  actor_name text,
  actor_username text,
  actor_avatar_url text,
  actor_frame_type text,
  manga_id uuid,
  manga_title text,
  manga_cover_image_url text,
  chapter_id uuid,
  chapter_number numeric,
  post_id uuid,
  comment_id uuid,
  route_hint text,
  summary text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      greatest(least(coalesce(p_limit, 20), 50), 1) as safe_limit,
      p_before_created_at as before_created_at,
      nullif(trim(coalesce(p_before_event_key, '')), '') as before_event_key,
      now() - interval '180 days' as window_start
  ),
  viewer as (
    select public.current_public_user_id() as user_id
  ),
  followed_users as (
    select uf.following_id as user_id
    from viewer v
    join public.user_follows uf
      on uf.follower_id = v.user_id
    where v.user_id is not null
  ),
  followed_fansubs as (
    select ff.fansub_id
    from viewer v
    join public.fansub_follows ff
      on ff.user_id = v.user_id
    where v.user_id is not null
  ),
  candidate_events as (
    select ae.*
    from followed_users fu
    join public.activity_events ae
      on ae.actor_type = 'user'
     and ae.actor_user_id = fu.user_id
     and ae.is_active = true
    union all
    select ae.*
    from followed_fansubs ff
    join public.activity_events ae
      on ae.actor_type = 'fansub'
     and ae.actor_fansub_id = ff.fansub_id
     and ae.is_active = true
  ),
  visible_events as (
    select ce.*
    from candidate_events ce
    left join public.users actor_user
      on ce.actor_type = 'user'
     and actor_user.id = ce.actor_user_id
    left join public.fansubs actor_fansub
      on ce.actor_type = 'fansub'
     and actor_fansub.id = ce.actor_fansub_id
    left join public.mangas m
      on ce.manga_id = m.id
    left join public.chapters c
      on ce.chapter_id = c.id
    cross join params p
    where
      ce.created_at >= p.window_start
      and (
        (ce.actor_type = 'user' and coalesce(actor_user.is_active, false) = true)
        or (ce.actor_type = 'fansub' and coalesce(actor_fansub.is_active, false) = true)
      )
      and (
        ce.manga_id is null
        or (coalesce(m.is_active, false) = true and coalesce(m.is_approved, false) = true)
      )
      and (
        ce.chapter_id is null
        or (
          coalesce(c.is_active, false) = true
          and coalesce(c.is_approved, false) = true
          and (c.publish_at is null or c.publish_at <= now())
        )
      )
  ),
  filtered_events as (
    select ve.*
    from visible_events ve
    cross join params p
    where
      p.before_created_at is null
      or ve.created_at < p.before_created_at
      or (
        ve.created_at = p.before_created_at
        and p.before_event_key is not null
        and ve.event_key < p.before_event_key
      )
  )
  select
    fe.event_key,
    fe.event_type,
    fe.actor_type,
    fe.actor_user_id,
    fe.actor_fansub_id,
    fe.actor_name,
    fe.actor_username,
    fe.actor_avatar_url,
    fe.actor_frame_type,
    fe.manga_id,
    fe.manga_title,
    fe.manga_cover_image_url,
    fe.chapter_id,
    fe.chapter_number,
    fe.post_id,
    fe.comment_id,
    fe.route_hint,
    fe.summary,
    fe.created_at
  from filtered_events fe
  order by fe.created_at desc, fe.event_key desc
  limit (select safe_limit from params);
$$;

revoke all on function public.get_followed_activity_feed(integer, timestamptz, text) from public;
grant execute on function public.get_followed_activity_feed(integer, timestamptz, text) to authenticated;

create or replace function public.prune_activity_events(
  p_keep_days integer default 120,
  p_delete_limit integer default 10000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep_days integer := greatest(least(coalesce(p_keep_days, 120), 3650), 7);
  v_delete_limit integer := greatest(least(coalesce(p_delete_limit, 10000), 50000), 100);
  v_deleted integer := 0;
begin
  with doomed as (
    select ae.id
    from public.activity_events ae
    where ae.created_at < now() - make_interval(days => v_keep_days)
    order by ae.created_at asc
    limit v_delete_limit
  )
  delete from public.activity_events ae
  using doomed d
  where ae.id = d.id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_activity_events(integer, integer) from public;

commit;
