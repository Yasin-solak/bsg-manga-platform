-- ============================================
-- BSG Manga | Follow feed phase-3
-- Date: 2026-02-20
-- - home.follow_feed feature flag
-- - fansub follow notification events
-- ============================================

begin;

insert into public.feature_flags (
  key,
  label,
  description,
  is_enabled,
  rollout_percent,
  is_public,
  metadata
)
values (
  'home.follow_feed',
  'Anasayfa Takip Akisi',
  'Takip akisinin anasayfada gorunurlugu ve rollout kontrolu.',
  true,
  100,
  true,
  jsonb_build_object('domain', 'home', 'module', 'follow_feed')
)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description,
      is_public = excluded.is_public,
      metadata = coalesce(public.feature_flags.metadata, '{}'::jsonb) || excluded.metadata;

create index if not exists fansub_follows_fansub_user_idx
  on public.fansub_follows (fansub_id, user_id);

create or replace function public.notify_fansub_manga_release_to_followers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fansub_name text := 'Fansub';
  v_manga_title text := coalesce(new.title, 'Manga');
  v_follower_user_id uuid;
  v_is_newly_visible boolean := false;
begin
  if not public.is_feature_enabled('home.follow_feed', true) then
    return new;
  end if;

  if new.fansub_id is null then
    return new;
  end if;

  if coalesce(new.is_approved, false) = false or coalesce(new.is_active, false) = false then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_is_newly_visible := true;
  else
    if coalesce(old.is_approved, false) = false and coalesce(new.is_approved, false) = true then
      v_is_newly_visible := true;
    elsif coalesce(old.is_active, false) = false and coalesce(new.is_active, false) = true then
      v_is_newly_visible := true;
    end if;
  end if;

  if not v_is_newly_visible then
    return new;
  end if;

  select coalesce(f.name, v_fansub_name)
  into v_fansub_name
  from public.fansubs f
  where f.id = new.fansub_id;

  for v_follower_user_id in
    select distinct ff.user_id
    from public.fansub_follows ff
    join public.users u
      on u.id = ff.user_id
    where ff.fansub_id = new.fansub_id
      and u.is_active = true
  loop
    perform public.push_notification(
      v_follower_user_id,
      'follow',
      'Takip ettigin fansub yeni manga ekledi',
      format('%s, "%s" mangasini ekledi.', v_fansub_name, v_manga_title),
      jsonb_build_object(
        'event', 'fansub_new_manga',
        'fansub_id', new.fansub_id,
        'manga_id', new.id,
        'manga_title', v_manga_title,
        'route_hint', format('/manga/%s', new.id::text),
        'event_key', format('fansub-new-manga:%s:%s', new.id::text, v_follower_user_id::text)
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_fansub_manga_release on public.mangas;
create trigger trg_notify_fansub_manga_release
  after insert or update of is_approved, is_active on public.mangas
  for each row
  execute function public.notify_fansub_manga_release_to_followers();

create or replace function public.notify_fansub_chapter_release_to_followers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fansub_id uuid;
  v_fansub_name text := 'Fansub';
  v_manga_title text := 'Manga';
  v_publish_at timestamptz := coalesce(new.publish_at, now());
  v_follower_user_id uuid;
  v_is_newly_visible boolean := false;
begin
  if not public.is_feature_enabled('home.follow_feed', true) then
    return new;
  end if;

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

  select
    coalesce(new.fansub_id, m.fansub_id),
    coalesce(m.title, v_manga_title)
  into v_fansub_id, v_manga_title
  from public.mangas m
  where m.id = new.manga_id;

  if v_fansub_id is null then
    return new;
  end if;

  select coalesce(f.name, v_fansub_name)
  into v_fansub_name
  from public.fansubs f
  where f.id = v_fansub_id;

  for v_follower_user_id in
    select distinct ff.user_id
    from public.fansub_follows ff
    join public.users u
      on u.id = ff.user_id
    where ff.fansub_id = v_fansub_id
      and u.is_active = true
  loop
    perform public.push_notification(
      v_follower_user_id,
      'follow',
      'Takip ettigin fansub yeni bolum yayinladi',
      format('%s, "%s" mangasinda %s. Bolumu yayinladi.', v_fansub_name, v_manga_title, new.chapter_number::text),
      jsonb_build_object(
        'event', 'fansub_new_chapter',
        'fansub_id', v_fansub_id,
        'manga_id', new.manga_id,
        'manga_title', v_manga_title,
        'chapter_id', new.id,
        'chapter_number', new.chapter_number,
        'route_hint', format('/manga/%s/chapter/%s', new.manga_id::text, new.chapter_number::text),
        'event_key', format('fansub-new-chapter:%s:%s', new.id::text, v_follower_user_id::text)
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_fansub_chapter_release on public.chapters;
create trigger trg_notify_fansub_chapter_release
  after insert or update of is_approved, is_active, publish_at on public.chapters
  for each row
  execute function public.notify_fansub_chapter_release_to_followers();

create or replace function public.notify_fansub_post_published_to_followers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fansub_name text := 'Fansub';
  v_post_title text := coalesce(nullif(trim(coalesce(new.title, '')), ''), 'Topluluk gonderisi');
  v_follower_user_id uuid;
  v_is_newly_visible boolean := false;
begin
  if not public.is_feature_enabled('home.follow_feed', true) then
    return new;
  end if;

  if new.related_fansub_id is null then
    return new;
  end if;

  if lower(btrim(coalesce(new.category, ''))) = 'duyuru' then
    return new;
  end if;

  if new.status <> 'approved' or coalesce(new.is_active, false) = false then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_is_newly_visible := true;
  else
    if old.status <> 'approved' and new.status = 'approved' then
      v_is_newly_visible := true;
    elsif coalesce(old.is_active, false) = false and coalesce(new.is_active, false) = true then
      v_is_newly_visible := true;
    end if;
  end if;

  if not v_is_newly_visible then
    return new;
  end if;

  select coalesce(f.name, v_fansub_name)
  into v_fansub_name
  from public.fansubs f
  where f.id = new.related_fansub_id;

  for v_follower_user_id in
    select distinct ff.user_id
    from public.fansub_follows ff
    join public.users u
      on u.id = ff.user_id
    where ff.fansub_id = new.related_fansub_id
      and u.is_active = true
  loop
    perform public.push_notification(
      v_follower_user_id,
      'follow',
      'Takip ettigin fansubdan yeni paylasim',
      format('%s, "%s" baslikli yeni bir paylasim yayinladi.', v_fansub_name, v_post_title),
      jsonb_build_object(
        'event', 'fansub_post',
        'fansub_id', new.related_fansub_id,
        'post_id', new.id,
        'post_title', v_post_title,
        'route_hint', format('/discussion/%s', new.id::text),
        'event_key', format('fansub-post:%s:%s', new.id::text, v_follower_user_id::text)
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_fansub_post_published on public.community_posts;
create trigger trg_notify_fansub_post_published
  after insert or update of status, is_active on public.community_posts
  for each row
  execute function public.notify_fansub_post_published_to_followers();

commit;
