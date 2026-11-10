-- The read counter does not change approved manga content; the approval guard recognizes this narrow metric rise separately.
-- The bypass works only with a transaction-local flag set by track_manga_read and only for total_views +1.

create or replace function public.enforce_manga_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_moderation_state() then
    return new;
  end if;

  if tg_op = 'INSERT' and coalesce(new.is_approved, false) = true then
    raise exception 'Manga onay durumunu yalniz admin true yapabilir.';
  end if;

  if tg_op = 'UPDATE' then
    if current_setting('app.manga_read_counter_update', true) = 'true'
      and coalesce(old.is_approved, false) = true
      and coalesce(new.is_approved, false) = true
      and new.total_views = old.total_views + 1
      and (to_jsonb(new) - 'total_views') = (to_jsonb(old) - 'total_views')
    then
      return new;
    end if;

    if coalesce(old.is_approved, false) = true then
      raise exception 'Onayli mangayi yalniz admin guncelleyebilir.';
    end if;

    if old.is_approved is distinct from new.is_approved then
      raise exception 'Manga onay durumunu yalniz admin degistirebilir.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function app_private.track_manga_read(
  p_manga_id uuid,
  p_chapter_id uuid default null,
  p_chapter_number numeric default null,
  p_client_key text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_should_increment boolean := true;
  v_total_views bigint;
  v_fansub_id uuid;
  v_month_start date;
  v_chapter_ref text;
  v_reader_key text;
  v_client_key text;
  v_last_read_at timestamptz;
  v_last_manga_read_at timestamptz;
  v_target_chapter_id uuid;
  v_target_chapter_number numeric;
begin
  if p_manga_id is null then
    raise exception 'Manga id zorunludur.';
  end if;

  v_user_id := public.current_public_user_id();

  if auth.uid() is not null and v_user_id is null then
    select m.total_views into v_total_views
    from public.mangas m
    where m.id = p_manga_id;
    return coalesce(v_total_views, 0);
  end if;

  if p_chapter_id is not null then
    select c.id, c.chapter_number
    into v_target_chapter_id, v_target_chapter_number
    from public.chapters c
    where c.id = p_chapter_id
      and c.manga_id = p_manga_id
      and c.is_approved = true
      and c.is_active = true
      and public.can_current_user_access_chapter(c.publish_at)
    limit 1;

    if not found then
      select m.total_views into v_total_views
      from public.mangas m
      where m.id = p_manga_id;
      return coalesce(v_total_views, 0);
    end if;
  elsif p_chapter_number is not null then
    select c.id, c.chapter_number
    into v_target_chapter_id, v_target_chapter_number
    from public.chapters c
    where c.manga_id = p_manga_id
      and c.chapter_number = p_chapter_number
      and c.is_approved = true
      and c.is_active = true
      and public.can_current_user_access_chapter(c.publish_at)
    order by c.created_at desc
    limit 1;

    if not found then
      select m.total_views into v_total_views
      from public.mangas m
      where m.id = p_manga_id;
      return coalesce(v_total_views, 0);
    end if;
  end if;

  if v_target_chapter_id is not null then
    v_chapter_ref := 'chapter:' || v_target_chapter_id::text;
  elsif p_chapter_number is not null then
    v_chapter_ref := 'chapter-number:' || p_chapter_number::text;
  else
    v_chapter_ref := 'manga:' || p_manga_id::text;
  end if;

  if v_user_id is not null then
    v_reader_key := 'user:' || v_user_id::text;
  else
    v_client_key := lower(regexp_replace(coalesce(p_client_key, ''), '[^a-z0-9_-]', '', 'g'));
    if length(v_client_key) between 16 and 96 then
      v_reader_key := 'anon:' || v_client_key;
    end if;
  end if;

  if coalesce(v_reader_key, '') = '' then
    select m.total_views into v_total_views
    from public.mangas m
    where m.id = p_manga_id;
    return coalesce(v_total_views, 0);
  end if;

  select t.last_read_at
  into v_last_read_at
  from public.manga_read_trackers t
  where t.reader_key = v_reader_key
    and t.manga_id = p_manga_id
    and t.chapter_ref = v_chapter_ref
  for update;

  if found and v_last_read_at >= v_now - interval '5 minutes' then
    v_should_increment := false;
  end if;

  select t.last_read_at
  into v_last_manga_read_at
  from public.manga_read_trackers t
  where t.reader_key = v_reader_key
    and t.manga_id = p_manga_id
  order by t.last_read_at desc
  limit 1;

  if v_last_manga_read_at is not null and v_last_manga_read_at >= v_now - interval '45 seconds' then
    v_should_increment := false;
  end if;

  insert into public.manga_read_trackers (
    reader_key,
    manga_id,
    chapter_ref,
    last_read_at,
    created_at,
    updated_at
  )
  values (
    v_reader_key,
    p_manga_id,
    v_chapter_ref,
    v_now,
    v_now,
    v_now
  )
  on conflict (reader_key, manga_id, chapter_ref)
  do update
  set last_read_at = excluded.last_read_at,
      updated_at = excluded.updated_at;

  if v_user_id is not null then
    insert into public.reading_history (
      user_id,
      manga_id,
      chapter_id,
      chapter_number,
      read_at,
      created_at
    )
    values (
      v_user_id,
      p_manga_id,
      v_target_chapter_id,
      coalesce(v_target_chapter_number, p_chapter_number),
      v_now,
      v_now
    )
    on conflict (user_id, manga_id)
    do update
    set chapter_id = excluded.chapter_id,
        chapter_number = excluded.chapter_number,
        read_at = excluded.read_at;
  end if;

  if v_should_increment then
    perform set_config('app.manga_read_counter_update', 'true', true);

    update public.mangas
    set total_views = total_views + 1
    where id = p_manga_id
      and is_active = true
      and is_approved = true
    returning total_views, fansub_id into v_total_views, v_fansub_id;

    perform set_config('app.manga_read_counter_update', '', true);

    if found then
      v_month_start := date_trunc('month', v_now)::date;

      insert into public.manga_monthly_views (
        month_start,
        manga_id,
        fansub_id,
        views,
        created_at,
        updated_at
      )
      values (
        v_month_start,
        p_manga_id,
        v_fansub_id,
        1,
        v_now,
        v_now
      )
      on conflict (month_start, manga_id)
      do update
      set views = public.manga_monthly_views.views + 1,
          fansub_id = excluded.fansub_id,
          updated_at = excluded.updated_at;
    else
      select m.total_views
      into v_total_views
      from public.mangas m
      where m.id = p_manga_id;
    end if;
  else
    select m.total_views
    into v_total_views
    from public.mangas m
    where m.id = p_manga_id;
  end if;

  return coalesce(v_total_views, 0);
end;
$$;

revoke execute on function app_private.track_manga_read(uuid, uuid, numeric, text) from public;
grant execute on function app_private.track_manga_read(uuid, uuid, numeric, text) to anon, authenticated, service_role;
