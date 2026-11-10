-- ============================================
-- Notification event pipeline
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

create index if not exists notifications_user_event_key_idx
  on public.notifications (user_id, ((data ->> 'event_key')))
  where data ? 'event_key';

create or replace function public.push_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text default null,
  p_data jsonb default '{}'::jsonb,
  p_icon text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(trim(coalesce(p_type, 'system')));
  v_payload jsonb := coalesce(p_data, '{}'::jsonb);
  v_event_key text := nullif(trim(coalesce(v_payload ->> 'event_key', '')), '');
begin
  if p_user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
  ) then
    return;
  end if;

  if v_type not in ('badge_earned', 'badge_purchased', 'level_up', 'follow', 'comment', 'mention', 'system') then
    v_type := 'system';
  end if;

  if v_event_key is not null
    and exists (
      select 1
      from public.notifications n
      where n.user_id = p_user_id
        and n.data ->> 'event_key' = v_event_key
    )
  then
    return;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    icon,
    data
  )
  values (
    p_user_id,
    v_type,
    coalesce(nullif(trim(coalesce(p_title, '')), ''), 'Bildirim'),
    nullif(trim(coalesce(p_message, '')), ''),
    nullif(trim(coalesce(p_icon, '')), ''),
    v_payload
  );
exception
  when others then
    raise notice 'push_notification failed: %', sqlerrm;
end;
$$;

grant execute on function public.push_notification(uuid, text, text, text, jsonb, text) to authenticated;

create or replace function public.notify_manga_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_username text := 'Bir kullanici';
  v_manga_title text := 'Manga';
  v_parent_user_id uuid;
  v_fansub_id uuid;
  v_staff_user_id uuid;
begin
  if coalesce(new.is_active, true) = false then
    return new;
  end if;

  select coalesce(u.username, v_actor_username)
  into v_actor_username
  from public.users u
  where u.id = new.user_id;

  select coalesce(m.title, v_manga_title), m.fansub_id
  into v_manga_title, v_fansub_id
  from public.mangas m
  where m.id = new.manga_id;

  if new.parent_id is not null then
    select mc.user_id
    into v_parent_user_id
    from public.manga_comments mc
    where mc.id = new.parent_id;

    if v_parent_user_id is not null and v_parent_user_id <> new.user_id then
      perform public.push_notification(
        v_parent_user_id,
        'comment',
        'Yorumuna yanit geldi',
        format('%s, "%s" mangasinda yorumuna yanit verdi.', v_actor_username, v_manga_title),
        jsonb_build_object(
          'event', 'manga_comment_reply',
          'manga_id', new.manga_id,
          'manga_title', v_manga_title,
          'comment_id', new.id,
          'parent_comment_id', new.parent_id,
          'actor_user_id', new.user_id,
          'route_hint', format('/manga/%s', new.manga_id::text),
          'event_key', format('manga-comment-reply:%s:%s', new.id::text, v_parent_user_id::text)
        )
      );
    end if;
  end if;

  if v_fansub_id is not null then
    for v_staff_user_id in
      select distinct fm.user_id
      from public.fansub_members fm
      join public.users u on u.id = fm.user_id
      where fm.fansub_id = v_fansub_id
        and fm.role in ('admin', 'moderator')
        and u.is_active = true
    loop
      if v_staff_user_id is null
        or v_staff_user_id = new.user_id
        or (v_parent_user_id is not null and v_staff_user_id = v_parent_user_id)
      then
        continue;
      end if;

      perform public.push_notification(
        v_staff_user_id,
        'comment',
        'Mangana yeni yorum geldi',
        format('%s, "%s" mangasina yorum yapti.', v_actor_username, v_manga_title),
        jsonb_build_object(
          'event', 'manga_comment_new',
          'manga_id', new.manga_id,
          'manga_title', v_manga_title,
          'comment_id', new.id,
          'actor_user_id', new.user_id,
          'route_hint', format('/manga/%s', new.manga_id::text),
          'event_key', format('manga-comment-new:%s:%s', new.id::text, v_staff_user_id::text)
        )
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_manga_comment_insert on public.manga_comments;
create trigger trg_notify_manga_comment_insert
  after insert on public.manga_comments
  for each row
  execute function public.notify_manga_comment_insert();

create or replace function public.notify_community_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_username text := 'Bir kullanici';
  v_post_title text := 'Topluluk gonderisi';
  v_post_author_id uuid;
  v_parent_author_id uuid;
begin
  if coalesce(new.is_active, true) = false then
    return new;
  end if;

  select coalesce(u.username, v_actor_username)
  into v_actor_username
  from public.users u
  where u.id = new.author_id;

  select coalesce(cp.title, v_post_title), cp.author_id
  into v_post_title, v_post_author_id
  from public.community_posts cp
  where cp.id = new.post_id;

  if new.parent_id is not null then
    select cc.author_id
    into v_parent_author_id
    from public.community_comments cc
    where cc.id = new.parent_id;
  end if;

  if v_parent_author_id is not null and v_parent_author_id <> new.author_id then
    perform public.push_notification(
      v_parent_author_id,
      'comment',
      'Topluluk yorumuna yanit geldi',
      format('%s, "%s" gonderisindeki yorumuna yanit verdi.', v_actor_username, v_post_title),
      jsonb_build_object(
        'event', 'community_comment_reply',
        'post_id', new.post_id,
        'post_title', v_post_title,
        'comment_id', new.id,
        'parent_comment_id', new.parent_id,
        'actor_user_id', new.author_id,
        'route_hint', format('/discussion/%s', new.post_id::text),
        'event_key', format('community-comment-reply:%s:%s', new.id::text, v_parent_author_id::text)
      )
    );
  end if;

  if v_post_author_id is not null
    and v_post_author_id <> new.author_id
    and (v_parent_author_id is null or v_post_author_id <> v_parent_author_id)
  then
    perform public.push_notification(
      v_post_author_id,
      'comment',
      'Postuna yeni yorum geldi',
      format('%s, "%s" gonderine yorum yapti.', v_actor_username, v_post_title),
      jsonb_build_object(
        'event', 'community_post_comment',
        'post_id', new.post_id,
        'post_title', v_post_title,
        'comment_id', new.id,
        'actor_user_id', new.author_id,
        'route_hint', format('/discussion/%s', new.post_id::text),
        'event_key', format('community-post-comment:%s:%s', new.id::text, v_post_author_id::text)
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_community_comment_insert on public.community_comments;
create trigger trg_notify_community_comment_insert
  after insert on public.community_comments
  for each row
  execute function public.notify_community_comment_insert();

create or replace function public.notify_chapter_release_to_followers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manga_title text := 'Manga';
  v_publish_at timestamptz := coalesce(new.publish_at, now());
  v_is_newly_visible boolean := false;
  v_follower_user_id uuid;
begin
  if coalesce(new.is_approved, false) = false or coalesce(new.is_active, false) = false then
    return new;
  end if;

  if v_publish_at > now() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_is_newly_visible := true;
  else
    if coalesce(old.is_approved, false) = false and coalesce(new.is_approved, false) = true then
      v_is_newly_visible := true;
    elsif coalesce(old.is_active, false) = false and coalesce(new.is_active, false) = true then
      v_is_newly_visible := true;
    elsif coalesce(old.publish_at, '9999-12-31T00:00:00Z'::timestamptz) > now() and v_publish_at <= now() then
      v_is_newly_visible := true;
    end if;
  end if;

  if not v_is_newly_visible then
    return new;
  end if;

  select coalesce(m.title, v_manga_title)
  into v_manga_title
  from public.mangas m
  where m.id = new.manga_id;

  for v_follower_user_id in
    select distinct mf.user_id
    from public.manga_follows mf
    join public.users u on u.id = mf.user_id
    where mf.manga_id = new.manga_id
      and u.is_active = true
  loop
    perform public.push_notification(
      v_follower_user_id,
      'follow',
      'Takip ettigin mangaya yeni bolum geldi',
      format('%s %s. Bolum yayinda.', v_manga_title, new.chapter_number::text),
      jsonb_build_object(
        'event', 'manga_chapter_release',
        'manga_id', new.manga_id,
        'chapter_id', new.id,
        'chapter_number', new.chapter_number,
        'manga_title', v_manga_title,
        'route_hint', format('/manga/%s/chapter/%s', new.manga_id::text, new.chapter_number::text),
        'event_key', format('chapter-release:%s:%s', new.id::text, v_follower_user_id::text)
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_chapter_release on public.chapters;
create trigger trg_notify_chapter_release
  after insert or update of is_approved, is_active, publish_at on public.chapters
  for each row
  execute function public.notify_chapter_release_to_followers();

create or replace function public.notify_pending_content_revision_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_label text := 'Icerik';
  v_action_label text := case when new.change_action = 'edit' then 'duzenleme' else 'olusturma' end;
  v_admin_user_id uuid;
  v_manga_title text;
  v_chapter_number integer;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if new.target_type = 'manga' then
    select coalesce(m.title, v_target_label)
    into v_target_label
    from public.mangas m
    where m.id = new.target_id;
  elsif new.target_type = 'chapter' then
    select m.title, c.chapter_number
    into v_manga_title, v_chapter_number
    from public.chapters c
    left join public.mangas m on m.id = c.manga_id
    where c.id = new.target_id;

    if v_manga_title is not null and v_chapter_number is not null then
      v_target_label := format('%s %s. Bolum', v_manga_title, v_chapter_number::text);
    end if;
  end if;

  for v_admin_user_id in
    select u.id
    from public.users u
    where u.role = 'admin'
      and u.is_active = true
  loop
    if new.requested_by is not null and v_admin_user_id = new.requested_by then
      continue;
    end if;

    perform public.push_notification(
      v_admin_user_id,
      'system',
      'Yeni onay bekleyen islem var',
      format('%s icin %s talebi admin onayi bekliyor.', v_target_label, v_action_label),
      jsonb_build_object(
        'event', 'pending_content_created',
        'target_type', new.target_type,
        'target_id', new.target_id,
        'change_action', new.change_action,
        'revision_id', new.id,
        'requested_by', new.requested_by,
        'fansub_id', new.fansub_id,
        'route_hint', '/admin',
        'event_key', format('pending-revision-created:%s:%s', new.id::text, v_admin_user_id::text)
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_pending_content_revision_created on public.pending_content_revisions;
create trigger trg_notify_pending_content_revision_created
  after insert on public.pending_content_revisions
  for each row
  execute function public.notify_pending_content_revision_created();

create or replace function public.notify_pending_content_revision_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_label text := 'Icerik';
  v_action_label text := case when new.change_action = 'edit' then 'duzenleme' else 'olusturma' end;
  v_status_label text := case when new.status = 'approved' then 'onaylandi' else 'reddedildi' end;
  v_reviewer_username text := 'Admin';
  v_note text := nullif(trim(coalesce(new.review_note, '')), '');
  v_recipient_id uuid;
  v_manga_title text;
  v_chapter_number integer;
begin
  if not (old.status = 'pending' and new.status in ('approved', 'rejected')) then
    return new;
  end if;

  if new.reviewed_by is not null then
    select coalesce(u.username, v_reviewer_username)
    into v_reviewer_username
    from public.users u
    where u.id = new.reviewed_by;
  end if;

  if new.target_type = 'manga' then
    select coalesce(m.title, v_target_label)
    into v_target_label
    from public.mangas m
    where m.id = new.target_id;
  elsif new.target_type = 'chapter' then
    select m.title, c.chapter_number
    into v_manga_title, v_chapter_number
    from public.chapters c
    left join public.mangas m on m.id = c.manga_id
    where c.id = new.target_id;

    if v_manga_title is not null and v_chapter_number is not null then
      v_target_label := format('%s %s. Bolum', v_manga_title, v_chapter_number::text);
    end if;
  end if;

  for v_recipient_id in
    select distinct x.user_id
    from (
      select new.requested_by as user_id
      union all
      select fm.user_id
      from public.fansub_members fm
      where fm.fansub_id = new.fansub_id
        and fm.role in ('admin', 'moderator')
    ) x
    join public.users u on u.id = x.user_id
    where x.user_id is not null
      and u.is_active = true
  loop
    if new.reviewed_by is not null and v_recipient_id = new.reviewed_by then
      continue;
    end if;

    perform public.push_notification(
      v_recipient_id,
      'system',
      case when new.status = 'approved' then 'Icerik talebi onaylandi' else 'Icerik talebi reddedildi' end,
      case
        when v_note is null then format('%s icin %s talebi %s.', v_target_label, v_action_label, v_status_label)
        else format('%s icin %s talebi %s. Not: %s', v_target_label, v_action_label, v_status_label, v_note)
      end,
      jsonb_build_object(
        'event', 'pending_content_review',
        'target_type', new.target_type,
        'target_id', new.target_id,
        'change_action', new.change_action,
        'status', new.status,
        'review_note', new.review_note,
        'reviewed_by', new.reviewed_by,
        'reviewed_by_username', v_reviewer_username,
        'revision_id', new.id,
        'fansub_id', new.fansub_id,
        'route_hint', '/admin',
        'event_key', format('pending-revision-reviewed:%s:%s:%s', new.id::text, new.status, v_recipient_id::text)
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_pending_content_revision_reviewed on public.pending_content_revisions;
create trigger trg_notify_pending_content_revision_reviewed
  after update of status, review_note, reviewed_by on public.pending_content_revisions
  for each row
  execute function public.notify_pending_content_revision_reviewed();

create or replace function public.notify_community_post_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_title text := coalesce(nullif(trim(coalesce(new.title, '')), ''), 'Topluluk gonderisi');
  v_note text := nullif(trim(coalesce(new.reject_reason, '')), '');
begin
  if not (old.status = 'pending' and new.status in ('approved', 'rejected')) then
    return new;
  end if;

  if new.author_id is null then
    return new;
  end if;

  perform public.push_notification(
    new.author_id,
    'system',
    case when new.status = 'approved' then 'Topluluk gonderin onaylandi' else 'Topluluk gonderin reddedildi' end,
    case
      when new.status = 'approved' then format('"%s" baslikli topluluk gonderin yayina alindi.', v_post_title)
      when v_note is null then format('"%s" baslikli topluluk gonderin reddedildi.', v_post_title)
      else format('"%s" baslikli topluluk gonderin reddedildi. Not: %s', v_post_title, v_note)
    end,
    jsonb_build_object(
      'event', 'community_post_review',
      'post_id', new.id,
      'post_title', v_post_title,
      'status', new.status,
      'reject_reason', new.reject_reason,
      'route_hint', format('/discussion/%s', new.id::text),
      'event_key', format('community-post-review:%s:%s:%s', new.id::text, new.status, new.author_id::text)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_community_post_reviewed on public.community_posts;
create trigger trg_notify_community_post_reviewed
  after update of status, reject_reason on public.community_posts
  for each row
  execute function public.notify_community_post_reviewed();

create or replace function public.notify_fansub_request_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(trim(coalesce(new.review_note, '')), '');
  v_created_fansub_name text;
begin
  if not (old.status = 'pending' and new.status in ('approved', 'rejected')) then
    return new;
  end if;

  if new.status = 'approved' and new.created_fansub_id is not null then
    select f.name
    into v_created_fansub_name
    from public.fansubs f
    where f.id = new.created_fansub_id;
  end if;

  perform public.push_notification(
    new.requester_user_id,
    'system',
    case when new.status = 'approved' then 'Fansub talebin onaylandi' else 'Fansub talebin reddedildi' end,
    case
      when new.status = 'approved' and v_created_fansub_name is not null then format('"%s" fansub talebin onaylandi.', v_created_fansub_name)
      when new.status = 'approved' then format('"%s" fansub talebin onaylandi.', coalesce(new.requested_name, 'Fansub'))
      when v_note is null then format('"%s" fansub talebin reddedildi.', coalesce(new.requested_name, 'Fansub'))
      else format('"%s" fansub talebin reddedildi. Not: %s', coalesce(new.requested_name, 'Fansub'), v_note)
    end,
    jsonb_build_object(
      'event', 'fansub_request_review',
      'request_id', new.id,
      'status', new.status,
      'created_fansub_id', new.created_fansub_id,
      'route_hint', '/fansublar',
      'event_key', format('fansub-request-review:%s:%s', new.id::text, new.requester_user_id::text)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_fansub_request_reviewed on public.fansub_requests;
create trigger trg_notify_fansub_request_reviewed
  after update of status, review_note on public.fansub_requests
  for each row
  execute function public.notify_fansub_request_reviewed();

commit;
