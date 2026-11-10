-- BSG Manga | List categories and showcase samples
-- Date: 2026-04-29

begin;

alter table public.user_manga_lists
  add column if not exists category_id text not null default 'action';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_manga_lists_category_id_check'
      and conrelid = 'public.user_manga_lists'::regclass
  ) then
    alter table public.user_manga_lists
      add constraint user_manga_lists_category_id_check
      check (
        category_id in (
          'action', 'romance', 'fantasy', 'comedy', 'drama',
          'horror', 'isekai', 'sports', 'adventure', 'supernatural',
          'magic', 'mystery', 'slice-of-life', 'school', 'music',
          'cooking', 'sci-fi', 'psychological', 'thriller', 'historical'
        )
      );
  end if;
end;
$$;

create index if not exists user_manga_lists_category_public_idx
  on public.user_manga_lists (category_id, is_public, updated_at desc);

insert into public.site_settings (id, store_home_config)
values (
  1,
  jsonb_build_object(
    'manga_lists_create_cover_images',
    jsonb_build_array(
      '/assets/explore/collections/dram.webp',
      '/assets/explore/collections/aksiyon.webp',
      '/assets/explore/collections/romantik.webp'
    )
  )
)
on conflict (id)
do update set
  store_home_config = coalesce(public.site_settings.store_home_config, '{}'::jsonb)
    || jsonb_build_object(
      'manga_lists_create_cover_images',
      jsonb_build_array(
        '/assets/explore/collections/dram.webp',
        '/assets/explore/collections/aksiyon.webp',
        '/assets/explore/collections/romantik.webp'
      )
    );

drop function if exists public.create_user_manga_list(text, text, boolean, uuid[]);
drop function if exists public.create_user_manga_list(text, text, boolean, text, uuid[]);

create or replace function public.create_user_manga_list(
  p_title text,
  p_description text default '',
  p_is_public boolean default true,
  p_category_id text default 'action',
  p_manga_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_list_id uuid;
  v_title text;
  v_category_id text;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if char_length(v_title) < 3 or char_length(v_title) > 80 then
    raise exception 'Liste basligi 3-80 karakter arasinda olmalidir.';
  end if;

  v_category_id := lower(btrim(coalesce(p_category_id, 'action')));
  if v_category_id not in (
    'action', 'romance', 'fantasy', 'comedy', 'drama',
    'horror', 'isekai', 'sports', 'adventure', 'supernatural',
    'magic', 'mystery', 'slice-of-life', 'school', 'music',
    'cooking', 'sci-fi', 'psychological', 'thriller', 'historical'
  ) then
    v_category_id := 'action';
  end if;

  insert into public.user_manga_lists (
    owner_id,
    title,
    description,
    is_public,
    category_id
  )
  values (
    v_actor_id,
    v_title,
    left(coalesce(p_description, ''), 1200),
    coalesce(p_is_public, true),
    v_category_id
  )
  returning id into v_list_id;

  with dedup_input as (
    select distinct on (src.manga_id)
      src.manga_id,
      src.ord
    from unnest(coalesce(p_manga_ids, '{}'::uuid[])) with ordinality as src(manga_id, ord)
    where src.manga_id is not null
    order by src.manga_id, src.ord
  ),
  valid_mangas as (
    select
      d.manga_id,
      row_number() over (order by d.ord) as pos
    from dedup_input d
    join public.mangas m
      on m.id = d.manga_id
     and m.is_active = true
     and m.is_approved = true
  )
  insert into public.user_manga_list_items (list_id, manga_id, position)
  select v_list_id, v.manga_id, v.pos
  from valid_mangas v
  order by v.pos
  on conflict (list_id, manga_id) do nothing;

  perform public.refresh_user_manga_list_stats(v_list_id);
  return v_list_id;
end;
$$;

drop function if exists public.update_user_manga_list(uuid, text, text, boolean, uuid[], jsonb);
drop function if exists public.update_user_manga_list(uuid, text, text, boolean, text, uuid[], jsonb);

create or replace function public.update_user_manga_list(
  p_list_id uuid,
  p_title text,
  p_description text default '',
  p_is_public boolean default true,
  p_category_id text default 'action',
  p_manga_ids uuid[] default '{}'::uuid[],
  p_item_notes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_owner_id uuid;
  v_title text;
  v_description text;
  v_category_id text;
  v_unique_ids uuid[] := '{}'::uuid[];
  v_manga_id uuid;
  v_position integer := 1;
  v_note text;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_list_id is null then
    raise exception 'Liste kimligi zorunludur.';
  end if;

  select uml.owner_id
  into v_owner_id
  from public.user_manga_lists uml
  where uml.id = p_list_id
  for update;

  if v_owner_id is null then
    raise exception 'Liste bulunamadi.';
  end if;

  if v_owner_id <> v_actor_id and not public.is_admin() then
    raise exception 'Bu listeyi duzenleme yetkiniz yok.';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if char_length(v_title) < 3 or char_length(v_title) > 80 then
    raise exception 'Liste basligi 3-80 karakter arasinda olmalidir.';
  end if;

  v_category_id := lower(btrim(coalesce(p_category_id, 'action')));
  if v_category_id not in (
    'action', 'romance', 'fantasy', 'comedy', 'drama',
    'horror', 'isekai', 'sports', 'adventure', 'supernatural',
    'magic', 'mystery', 'slice-of-life', 'school', 'music',
    'cooking', 'sci-fi', 'psychological', 'thriller', 'historical'
  ) then
    v_category_id := 'action';
  end if;

  v_description := left(coalesce(p_description, ''), 1200);

  foreach v_manga_id in array coalesce(p_manga_ids, '{}'::uuid[]) loop
    if v_manga_id is null then
      continue;
    end if;
    if array_position(v_unique_ids, v_manga_id) is null then
      v_unique_ids := array_append(v_unique_ids, v_manga_id);
    end if;
  end loop;

  if coalesce(array_length(v_unique_ids, 1), 0) = 0 then
    raise exception 'Liste en az bir manga icermelidir.';
  end if;

  update public.user_manga_lists
  set
    title = v_title,
    description = v_description,
    is_public = coalesce(p_is_public, true),
    category_id = v_category_id,
    updated_at = now()
  where id = p_list_id;

  delete from public.user_manga_list_items
  where list_id = p_list_id;

  foreach v_manga_id in array v_unique_ids loop
    if exists (
      select 1
      from public.mangas m
      where m.id = v_manga_id
        and m.is_active = true
        and m.is_approved = true
    ) then
      v_note := left(btrim(coalesce(p_item_notes ->> v_manga_id::text, '')), 300);

      insert into public.user_manga_list_items (
        list_id,
        manga_id,
        position,
        note
      )
      values (
        p_list_id,
        v_manga_id,
        v_position,
        nullif(v_note, '')
      );

      v_position := v_position + 1;
    end if;
  end loop;

  if v_position = 1 then
    raise exception 'Listeye eklenecek gecerli manga bulunamadi.';
  end if;

  perform public.refresh_user_manga_list_stats(p_list_id);
  return p_list_id;
end;
$$;

drop function if exists public.get_top_user_manga_lists(text, integer);

create or replace function public.get_top_user_manga_lists(
  p_period text default 'weekly',
  p_limit integer default 5
)
returns table (
  list_id uuid,
  title text,
  description text,
  owner_id uuid,
  owner_username text,
  owner_avatar_url text,
  category_id text,
  cover_manga_id uuid,
  cover_manga_title text,
  cover_manga_slug text,
  cover_image_url text,
  items_count integer,
  ratings_count integer,
  rating_avg numeric(3,2),
  comments_count integer,
  period_rating_count integer,
  period_comment_count integer,
  score numeric(10,2),
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
set search_path = public
as $$
  with params as (
    select
      greatest(least(coalesce(p_limit, 5), 12), 1) as safe_limit,
      case
        when lower(trim(coalesce(p_period, 'weekly'))) = 'monthly' then now() - interval '30 days'
        else now() - interval '7 days'
      end as window_start
  ),
  rating_period as (
    select lr.list_id, count(*)::integer as rating_count
    from public.user_manga_list_ratings lr
    join params p on true
    where lr.updated_at >= p.window_start
    group by lr.list_id
  ),
  comment_period as (
    select lc.list_id, count(*)::integer as comment_count
    from public.user_manga_list_comments lc
    join params p on true
    where lc.is_active = true
      and lc.created_at >= p.window_start
    group by lc.list_id
  )
  select
    uml.id as list_id,
    uml.title,
    uml.description,
    uml.owner_id,
    u.username as owner_username,
    u.avatar_url as owner_avatar_url,
    uml.category_id,
    uml.cover_manga_id,
    m.title as cover_manga_title,
    m.slug as cover_manga_slug,
    m.cover_image_url,
    uml.items_count,
    uml.ratings_count,
    uml.rating_avg,
    uml.comments_count,
    coalesce(rp.rating_count, 0) as period_rating_count,
    coalesce(cp.comment_count, 0) as period_comment_count,
    (
      (coalesce(rp.rating_count, 0) * 2.0)
      + (coalesce(cp.comment_count, 0) * 1.25)
      + (coalesce(uml.rating_avg, 0) * 3.0)
      + (least(coalesce(uml.items_count, 0), 30) * 0.20)
    )::numeric(10,2) as score,
    uml.created_at,
    uml.updated_at
  from public.user_manga_lists uml
  join public.users u
    on u.id = uml.owner_id
   and u.is_active = true
  left join public.mangas m
    on m.id = uml.cover_manga_id
   and m.is_active = true
   and m.is_approved = true
  left join rating_period rp on rp.list_id = uml.id
  left join comment_period cp on cp.list_id = uml.id
  where uml.is_public = true
  order by score desc, uml.rating_avg desc, uml.ratings_count desc, uml.updated_at desc
  limit (select safe_limit from params);
$$;

do $$
declare
  v_owner_id uuid;
  v_list_id uuid;
  v_cover_id uuid;
  v_seed record;
begin
  select u.id
  into v_owner_id
  from public.users u
  where u.is_active = true
  order by case when u.role = 'admin' then 0 else 1 end, u.created_at asc
  limit 1;

  if v_owner_id is null then
    return;
  end if;

  for v_seed in
    select *
    from (
      values
        ('Aksiyon Patlamasi', 'Yuksek tempo, dovus ve macera isteyen okurlar icin secilmis seri listesi.', 'action', array['action', 'adventure', 'martial-arts']::text[]),
        ('Dram Arsivi', 'Agir atmosfer, karakter kirilmalari ve duygusal ritmi guclu seriler.', 'drama', array['drama', 'psychological', 'thriller']::text[]),
        ('Romantik Seckiler', 'Yavas yanan iliskiler, okul hayati ve sicak romantik hikayeler.', 'romance', array['romance', 'slice-of-life', 'school']::text[]),
        ('Fantazi Kapilari', 'Buyu, isekai ve guc fantezisi arayanlar icin topluluk vitrini.', 'fantasy', array['fantasy', 'magic', 'isekai']::text[])
    ) as seed(title, description, category_id, genres)
  loop
    select uml.id
    into v_list_id
    from public.user_manga_lists uml
    where uml.owner_id = v_owner_id
      and uml.title = v_seed.title
    limit 1;

    select m.id
    into v_cover_id
    from public.mangas m
    where m.is_active = true
      and m.is_approved = true
      and m.genres && v_seed.genres
    order by coalesce(m.rating, 0) desc, coalesce(m.total_views, 0) desc, m.updated_at desc
    limit 1;

    if v_cover_id is null then
      select m.id
      into v_cover_id
      from public.mangas m
      where m.is_active = true
        and m.is_approved = true
      order by coalesce(m.rating, 0) desc, coalesce(m.total_views, 0) desc, m.updated_at desc
      limit 1;
    end if;

    if v_cover_id is null then
      continue;
    end if;

    if v_list_id is null then
      insert into public.user_manga_lists (
        owner_id,
        title,
        description,
        is_public,
        category_id,
        cover_manga_id
      )
      values (
        v_owner_id,
        v_seed.title,
        v_seed.description,
        true,
        v_seed.category_id,
        v_cover_id
      )
      returning id into v_list_id;
    else
      update public.user_manga_lists
      set
        description = v_seed.description,
        is_public = true,
        category_id = v_seed.category_id,
        cover_manga_id = coalesce(cover_manga_id, v_cover_id),
        updated_at = now()
      where id = v_list_id;
    end if;

    delete from public.user_manga_list_items
    where list_id = v_list_id;

    with selected as (
      select
        m.id,
        row_number() over (
          order by coalesce(m.rating, 0) desc, coalesce(m.total_views, 0) desc, m.updated_at desc
        ) as position
      from public.mangas m
      where m.is_active = true
        and m.is_approved = true
        and m.genres && v_seed.genres
      order by coalesce(m.rating, 0) desc, coalesce(m.total_views, 0) desc, m.updated_at desc
      limit 6
    )
    insert into public.user_manga_list_items (list_id, manga_id, position, note)
    select v_list_id, selected.id, selected.position, null
    from selected
    on conflict (list_id, manga_id) do nothing;

    if not exists (
      select 1
      from public.user_manga_list_items item
      where item.list_id = v_list_id
    ) then
      with selected as (
        select
          m.id,
          row_number() over (
            order by coalesce(m.rating, 0) desc, coalesce(m.total_views, 0) desc, m.updated_at desc
          ) as position
        from public.mangas m
        where m.is_active = true
          and m.is_approved = true
        order by coalesce(m.rating, 0) desc, coalesce(m.total_views, 0) desc, m.updated_at desc
        limit 6
      )
      insert into public.user_manga_list_items (list_id, manga_id, position, note)
      select v_list_id, selected.id, selected.position, null
      from selected
      on conflict (list_id, manga_id) do nothing;
    end if;

    perform public.refresh_user_manga_list_stats(v_list_id);

    insert into public.user_manga_list_ratings (list_id, user_id, rating)
    values (v_list_id, v_owner_id, 5)
    on conflict (list_id, user_id)
    do update set rating = excluded.rating, updated_at = now();

    perform public.refresh_user_manga_list_stats(v_list_id);
  end loop;
end;
$$;

revoke all on function public.create_user_manga_list(text, text, boolean, text, uuid[]) from public;
grant execute on function public.create_user_manga_list(text, text, boolean, text, uuid[]) to authenticated;

revoke all on function public.update_user_manga_list(uuid, text, text, boolean, text, uuid[], jsonb) from public;
grant execute on function public.update_user_manga_list(uuid, text, text, boolean, text, uuid[], jsonb) to authenticated;

revoke all on function public.get_top_user_manga_lists(text, integer) from public;
grant execute on function public.get_top_user_manga_lists(text, integer) to anon, authenticated;

commit;
