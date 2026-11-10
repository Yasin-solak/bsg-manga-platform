-- The new chapter notification address moves to the new reader (/oku).
--
-- As part of Phase 7 (link migration): all chapter links in the app moved to /oku
-- via `buildPublicChapterPath`; the push/notification path must also
-- land there, otherwise a user from a notification would land on the old
-- reader.
--
-- Notes:
-- * The path is built with `manga_id` (uuid). The /oku route accepts a slug or
-- id as mangaKey (getMangaByIdentifier tells uuid apart), so no extra
-- slug query.
-- * The fansub key is added: if a chapter has several fansub versions
-- the version of the notifying fansub opens. The old path did not carry this and
-- the user could land on another team's version.
-- * Old reader routes were NOT DELETED; addresses in old notifications keep
-- working.
-- * The function body is copied exactly from 20260220_062; the ONLY change is
-- `route_hint`. No new policy/grant, the app_private wrapper rule does not apply in this
-- migration.

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
        'route_hint', format('/oku/%s/%s/%s', new.manga_id::text, new.chapter_number::text, v_fansub_id::text),
        'event_key', format('fansub-new-chapter:%s:%s', new.id::text, v_follower_user_id::text)
      )
    );
  end loop;

  return new;
end;
$$;
