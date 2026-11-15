-- Release notifications to followers used to call push_notification once per
-- follower, inside the transaction that publishes the chapter or manga. With a
-- large follower list that loop can push a publish past the statement timeout
-- and roll it back. Followers are now notified with one set-based insert that
-- applies the same rules as push_notification: active user, notification type
-- enabled, event_key de-duplication, trimmed title and message. If the bulk
-- insert raises an error, the old per-user path runs instead, where each
-- failure is isolated, so a single bad row cannot block a release. A statement
-- timeout (query_canceled) is deliberately not caught and still aborts the
-- publish, as before; the set-based insert makes that far less likely.

create or replace function app_private.push_follow_notifications(
  p_follower_ids uuid[],
  p_title text,
  p_message text,
  p_data jsonb,
  p_event_key_prefix text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inserted integer := 0;
  v_follower_id uuid;
  v_title text := coalesce(nullif(trim(coalesce(p_title, '')), ''), 'Bildirim');
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
begin
  if p_follower_ids is null or cardinality(p_follower_ids) = 0 then
    return 0;
  end if;

  begin
    insert into public.notifications (user_id, type, title, message, icon, data)
    select
      u.id,
      'follow',
      v_title,
      v_message,
      null,
      v_data || jsonb_build_object('event_key', p_event_key_prefix || u.id::text)
    from public.users u
    where u.id = any (p_follower_ids)
      and u.is_active = true
      and public.is_notification_type_enabled(u.id, 'follow')
      and not exists (
        select 1
        from public.notifications n
        where n.user_id = u.id
          and n.data ? 'event_key'
          and n.data ->> 'event_key' = p_event_key_prefix || u.id::text
      );

    get diagnostics v_inserted = row_count;
    -- Returns the number of rows inserted on the bulk path.
    return v_inserted;
  exception
    when others then
      raise notice 'push_follow_notifications bulk insert failed, using the per-user path: %', sqlerrm;
  end;

  foreach v_follower_id in array p_follower_ids loop
    perform public.push_notification(
      v_follower_id,
      'follow',
      p_title,
      p_message,
      v_data || jsonb_build_object('event_key', p_event_key_prefix || v_follower_id::text)
    );
  end loop;

  -- -1 marks that the per-user fallback ran.
  return -1;
end;
$function$;

revoke execute on function app_private.push_follow_notifications(uuid[], text, text, jsonb, text) from public, anon, authenticated;

create or replace function public.notify_chapter_release_to_followers()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_manga_title text := 'Manga';
  v_publish_at timestamptz := coalesce(new.publish_at, now());
  v_is_newly_visible boolean := false;
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

  perform app_private.push_follow_notifications(
    array(
      select distinct mf.user_id
      from public.manga_follows mf
      join public.users u on u.id = mf.user_id
      where mf.manga_id = new.manga_id
        and u.is_active = true
    ),
    'Takip ettigin mangaya yeni bolum geldi',
    format('%s %s. Bolum yayinda.', v_manga_title, new.chapter_number::text),
    jsonb_build_object(
      'event', 'manga_chapter_release',
      'manga_id', new.manga_id,
      'chapter_id', new.id,
      'chapter_number', new.chapter_number,
      'manga_title', v_manga_title,
      'route_hint', format('/manga/%s/chapter/%s', new.manga_id::text, new.chapter_number::text)
    ),
    format('chapter-release:%s:', new.id::text)
  );

  return new;
end;
$function$;

create or replace function public.notify_fansub_chapter_release_to_followers()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fansub_id uuid;
  v_fansub_name text := 'Fansub';
  v_manga_title text := 'Manga';
  v_publish_at timestamptz := coalesce(new.publish_at, now());
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

  perform app_private.push_follow_notifications(
    array(
      select distinct ff.user_id
      from public.fansub_follows ff
      join public.users u on u.id = ff.user_id
      where ff.fansub_id = v_fansub_id
        and u.is_active = true
    ),
    'Takip ettigin fansub yeni bolum yayinladi',
    format('%s, "%s" mangasinda %s. Bolumu yayinladi.', v_fansub_name, v_manga_title, new.chapter_number::text),
    jsonb_build_object(
      'event', 'fansub_new_chapter',
      'fansub_id', v_fansub_id,
      'manga_id', new.manga_id,
      'manga_title', v_manga_title,
      'chapter_id', new.id,
      'chapter_number', new.chapter_number,
      'route_hint', format('/oku/%s/%s/%s', new.manga_id::text, new.chapter_number::text, v_fansub_id::text)
    ),
    format('fansub-new-chapter:%s:', new.id::text)
  );

  return new;
end;
$function$;

create or replace function public.notify_fansub_manga_release_to_followers()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fansub_name text := 'Fansub';
  v_manga_title text := coalesce(new.title, 'Manga');
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

  perform app_private.push_follow_notifications(
    array(
      select distinct ff.user_id
      from public.fansub_follows ff
      join public.users u on u.id = ff.user_id
      where ff.fansub_id = new.fansub_id
        and u.is_active = true
    ),
    'Takip ettigin fansub yeni manga ekledi',
    format('%s, "%s" mangasini ekledi.', v_fansub_name, v_manga_title),
    jsonb_build_object(
      'event', 'fansub_new_manga',
      'fansub_id', new.fansub_id,
      'manga_id', new.id,
      'manga_title', v_manga_title,
      'route_hint', format('/manga/%s', new.id::text)
    ),
    format('fansub-new-manga:%s:', new.id::text)
  );

  return new;
end;
$function$;
