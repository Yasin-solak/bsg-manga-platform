-- ============================================
-- MangaZone | Read Validation v2 + Explore/Search v2
-- Date: 2026-02-14
-- ============================================

begin;

create extension if not exists pg_trgm;

create or replace function public.search_normalize(p_value text)
returns text
language sql
immutable
returns null on null input
as $$
  select translate(
    lower(p_value),
    'çğıöşüâîûáàéèóòúùäëïñ',
    'cgiosuaiuaaeeoouuaein'
  );
$$;

create index if not exists mangas_search_v2_title_trgm_idx
  on public.mangas using gin (public.search_normalize(title) gin_trgm_ops)
  where is_active = true and is_approved = true;

create index if not exists mangas_search_v2_slug_trgm_idx
  on public.mangas using gin (public.search_normalize(slug) gin_trgm_ops)
  where is_active = true and is_approved = true;

drop function if exists public.track_manga_read(uuid, uuid, numeric, text);

create or replace function public.track_manga_read(
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

  -- Banned/inactive users cannot raise views even with an auth token.
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
      and c.publish_at <= v_now
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
      and c.publish_at <= v_now
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

  -- We do not raise views for anon users with no client key.
  if coalesce(v_reader_key, '') = '' then
    select m.total_views into v_total_views
    from public.mangas m
    where m.id = p_manga_id;
    return coalesce(v_total_views, 0);
  end if;

  -- Block repeated attempts on the same chapter in a short time.
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

  -- Farkli chapterlar arasinda cok hizli spam gecislerini de engelle.
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

  -- Keep the tracker record current in all cases for a sliding-window anti spam.
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
    update public.mangas
    set total_views = total_views + 1
    where id = p_manga_id
      and is_active = true
      and is_approved = true
    returning total_views, fansub_id into v_total_views, v_fansub_id;

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

grant execute on function public.track_manga_read(uuid, uuid, numeric, text) to anon, authenticated;

create or replace function public.search_public_mangas_v2(
  p_search text default null,
  p_genres text[] default null,
  p_status text default 'all',
  p_sort text default 'popular',
  p_page integer default 1,
  p_limit integer default 20
)
returns table (
  id uuid,
  fansub_id uuid,
  title text,
  slug text,
  cover_image_url text,
  description text,
  status text,
  rating numeric,
  total_ratings integer,
  total_views bigint,
  follower_count bigint,
  is_new boolean,
  last_chapter_number numeric,
  genres text[],
  created_at timestamptz,
  updated_at timestamptz,
  search_score double precision,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_search_normalized text;
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'all'));
  v_sort text := lower(coalesce(nullif(trim(p_sort), ''), 'popular'));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 60);
  v_offset integer;
  v_genres text[];
begin
  if v_status not in ('all', 'ongoing', 'completed', 'hiatus', 'new') then
    v_status := 'all';
  end if;

  if v_sort not in ('popular', 'latest', 'rating', 'title') then
    v_sort := 'popular';
  end if;

  v_offset := (v_page - 1) * v_limit;
  v_search_normalized := case when v_search is null then null else public.search_normalize(v_search) end;
  v_genres := (
    select coalesce(array_agg(distinct public.search_normalize(trim(g))), '{}'::text[])
    from unnest(coalesce(p_genres, '{}'::text[])) g
    where trim(g) <> ''
  );

  return query
  with filtered as (
    select
      m.id,
      m.fansub_id,
      m.title,
      m.slug,
      m.cover_image_url,
      m.description,
      m.status,
      m.rating,
      m.total_ratings,
      m.total_views,
      null::bigint as follower_count,
      m.is_new,
      m.last_chapter_number,
      m.genres,
      m.created_at,
      m.updated_at,
      (
        case
          when v_search_normalized is null then 0::double precision
          else
            (case when public.search_normalize(m.title) = v_search_normalized then 140 else 0 end) +
            (case when public.search_normalize(m.title) like v_search_normalized || '%' then 80 else 0 end) +
            (case when public.search_normalize(m.title) like '%' || v_search_normalized || '%' then 45 else 0 end) +
            (case when public.search_normalize(m.slug) like '%' || v_search_normalized || '%' then 28 else 0 end) +
            (case when public.search_normalize(coalesce(m.description, '')) like '%' || v_search_normalized || '%' then 12 else 0 end) +
            (case when exists (
              select 1
              from unnest(coalesce(m.genres, '{}'::text[])) mg
              where public.search_normalize(mg) like '%' || v_search_normalized || '%'
            ) then 16 else 0 end) +
            greatest(similarity(public.search_normalize(m.title), v_search_normalized), 0) * 35 +
            greatest(similarity(public.search_normalize(m.slug), v_search_normalized), 0) * 14
        end
      )::double precision as search_score
    from public.mangas m
    where m.is_active = true
      and m.is_approved = true
      and (
        coalesce(array_length(v_genres, 1), 0) = 0
        or exists (
          select 1
          from unnest(coalesce(m.genres, '{}'::text[])) mg
          where public.search_normalize(mg) = any(v_genres)
        )
      )
      and (
        v_status = 'all'
        or (v_status = 'new' and coalesce(m.is_new, false) = true)
        or (v_status <> 'new' and m.status = v_status)
      )
      and (
        v_search_normalized is null
        or public.search_normalize(m.title) like '%' || v_search_normalized || '%'
        or public.search_normalize(m.slug) like '%' || v_search_normalized || '%'
        or public.search_normalize(coalesce(m.description, '')) like '%' || v_search_normalized || '%'
        or exists (
          select 1
          from unnest(coalesce(m.genres, '{}'::text[])) mg
          where public.search_normalize(mg) like '%' || v_search_normalized || '%'
        )
        or similarity(public.search_normalize(m.title), v_search_normalized) >= 0.2
        or similarity(public.search_normalize(m.slug), v_search_normalized) >= 0.2
      )
  ),
  ranked as (
    select f.*, count(*) over() as total_count
    from filtered f
  )
  select
    r.id,
    r.fansub_id,
    r.title,
    r.slug,
    r.cover_image_url,
    r.description,
    r.status,
    r.rating,
    r.total_ratings,
    r.total_views,
    r.follower_count,
    r.is_new,
    r.last_chapter_number,
    r.genres,
    r.created_at,
    r.updated_at,
    r.search_score,
    r.total_count
  from ranked r
  order by
    case when v_sort = 'title' then lower(r.title) end asc nulls last,
    case when v_sort <> 'title' and v_search_normalized is not null then r.search_score end desc nulls last,
    case when v_sort = 'latest' then r.updated_at end desc nulls last,
    case when v_sort = 'rating' then r.rating end desc nulls last,
    case when v_sort in ('popular', 'latest', 'rating') then r.total_views end desc nulls last,
    case when v_sort = 'popular' then r.rating end desc nulls last,
    r.updated_at desc,
    r.id asc
  offset v_offset
  limit v_limit;
end;
$$;

grant execute on function public.search_public_mangas_v2(text, text[], text, text, integer, integer) to anon, authenticated;

commit;
