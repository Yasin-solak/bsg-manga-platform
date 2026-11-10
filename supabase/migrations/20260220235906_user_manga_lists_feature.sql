-- ============================================
-- BSG Manga | User Manga Lists + Rating + Comment
-- Date: 2026-02-20
-- ============================================

begin;

create table if not exists public.user_manga_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  is_public boolean not null default true,
  cover_manga_id uuid references public.mangas(id) on delete set null,
  items_count integer not null default 0 check (items_count >= 0),
  ratings_count integer not null default 0 check (ratings_count >= 0),
  rating_avg numeric(3,2) not null default 0 check (rating_avg >= 0 and rating_avg <= 5),
  comments_count integer not null default 0 check (comments_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(title)) between 3 and 80)
);

create index if not exists user_manga_lists_owner_idx
  on public.user_manga_lists (owner_id, created_at desc);

create index if not exists user_manga_lists_public_idx
  on public.user_manga_lists (is_public, created_at desc);

create index if not exists user_manga_lists_score_idx
  on public.user_manga_lists (rating_avg desc, ratings_count desc, comments_count desc, created_at desc);

create table if not exists public.user_manga_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.user_manga_lists(id) on delete cascade,
  manga_id uuid not null references public.mangas(id) on delete cascade,
  position integer not null default 1 check (position >= 1 and position <= 500),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_id, manga_id),
  unique (list_id, position)
);

create index if not exists user_manga_list_items_manga_idx
  on public.user_manga_list_items (manga_id);

create index if not exists user_manga_list_items_list_position_idx
  on public.user_manga_list_items (list_id, position);

create table if not exists public.user_manga_list_ratings (
  list_id uuid not null references public.user_manga_lists(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create index if not exists user_manga_list_ratings_user_idx
  on public.user_manga_list_ratings (user_id, updated_at desc);

create index if not exists user_manga_list_ratings_list_updated_idx
  on public.user_manga_list_ratings (list_id, updated_at desc);

create table if not exists public.user_manga_list_comments (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.user_manga_lists(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  parent_id uuid references public.user_manga_list_comments(id) on delete cascade,
  body text not null,
  likes_count integer not null default 0 check (likes_count >= 0),
  dislikes_count integer not null default 0 check (dislikes_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists user_manga_list_comments_list_active_created_idx
  on public.user_manga_list_comments (list_id, created_at desc)
  where is_active = true;

create index if not exists user_manga_list_comments_parent_idx
  on public.user_manga_list_comments (parent_id);

create index if not exists user_manga_list_comments_author_idx
  on public.user_manga_list_comments (author_id, created_at desc);

create table if not exists public.user_manga_list_comment_reactions (
  comment_id uuid not null references public.user_manga_list_comments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists user_manga_list_comment_reactions_user_idx
  on public.user_manga_list_comment_reactions (user_id, updated_at desc);

create index if not exists user_manga_list_comment_reactions_comment_idx
  on public.user_manga_list_comment_reactions (comment_id);

drop trigger if exists trg_user_manga_lists_updated_at on public.user_manga_lists;
create trigger trg_user_manga_lists_updated_at
before update on public.user_manga_lists
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_manga_list_items_updated_at on public.user_manga_list_items;
create trigger trg_user_manga_list_items_updated_at
before update on public.user_manga_list_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_manga_list_ratings_updated_at on public.user_manga_list_ratings;
create trigger trg_user_manga_list_ratings_updated_at
before update on public.user_manga_list_ratings
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_manga_list_comments_updated_at on public.user_manga_list_comments;
create trigger trg_user_manga_list_comments_updated_at
before update on public.user_manga_list_comments
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_manga_list_comment_reactions_updated_at on public.user_manga_list_comment_reactions;
create trigger trg_user_manga_list_comment_reactions_updated_at
before update on public.user_manga_list_comment_reactions
for each row execute function public.set_updated_at();

create or replace function public.is_user_manga_list_owner(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_manga_lists uml
    where uml.id = p_list_id
      and uml.owner_id = public.current_public_user_id()
  );
$$;

create or replace function public.refresh_user_manga_list_stats(p_list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items_count integer := 0;
  v_ratings_count integer := 0;
  v_rating_avg numeric(3,2) := 0;
  v_comments_count integer := 0;
  v_cover_manga_id uuid := null;
begin
  if p_list_id is null then
    return;
  end if;

  select count(*)::integer
  into v_items_count
  from public.user_manga_list_items li
  where li.list_id = p_list_id;

  select
    count(*)::integer,
    coalesce(round(avg(lr.rating)::numeric, 2), 0)::numeric(3,2)
  into v_ratings_count, v_rating_avg
  from public.user_manga_list_ratings lr
  where lr.list_id = p_list_id;

  select count(*)::integer
  into v_comments_count
  from public.user_manga_list_comments lc
  where lc.list_id = p_list_id
    and lc.is_active = true;

  select li.manga_id
  into v_cover_manga_id
  from public.user_manga_list_items li
  where li.list_id = p_list_id
  order by li.position asc, li.created_at asc
  limit 1;

  update public.user_manga_lists
  set
    items_count = coalesce(v_items_count, 0),
    ratings_count = coalesce(v_ratings_count, 0),
    rating_avg = coalesce(v_rating_avg, 0),
    comments_count = coalesce(v_comments_count, 0),
    cover_manga_id = v_cover_manga_id,
    updated_at = now()
  where id = p_list_id;
end;
$$;

create or replace function public.sync_user_manga_list_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list_id uuid;
begin
  v_list_id := coalesce(new.list_id, old.list_id);
  perform public.refresh_user_manga_list_stats(v_list_id);

  if tg_op = 'UPDATE' and old.list_id is distinct from new.list_id then
    perform public.refresh_user_manga_list_stats(old.list_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_user_manga_list_items_stats on public.user_manga_list_items;
create trigger trg_sync_user_manga_list_items_stats
after insert or update or delete on public.user_manga_list_items
for each row execute function public.sync_user_manga_list_stats();

drop trigger if exists trg_sync_user_manga_list_ratings_stats on public.user_manga_list_ratings;
create trigger trg_sync_user_manga_list_ratings_stats
after insert or update or delete on public.user_manga_list_ratings
for each row execute function public.sync_user_manga_list_stats();

drop trigger if exists trg_sync_user_manga_list_comments_stats on public.user_manga_list_comments;
create trigger trg_sync_user_manga_list_comments_stats
after insert or update or delete on public.user_manga_list_comments
for each row execute function public.sync_user_manga_list_stats();

create or replace function public.validate_user_manga_list_comment_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_list_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.list_id is distinct from old.list_id then
      raise exception 'Yorumun liste baglami degistirilemez.';
    end if;

    if new.parent_id is distinct from old.parent_id then
      raise exception 'Yorumun parent baglami degistirilemez.';
    end if;
  end if;

  if new.parent_id is not null then
    select lc.list_id
    into v_parent_list_id
    from public.user_manga_list_comments lc
    where lc.id = new.parent_id;

    if v_parent_list_id is null then
      raise exception 'Yanitlanacak yorum bulunamadi.';
    end if;

    if v_parent_list_id <> new.list_id then
      raise exception 'Yanit yorumunun liste baglami gecersiz.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_user_manga_list_comment_scope on public.user_manga_list_comments;
create trigger trg_validate_user_manga_list_comment_scope
before insert or update on public.user_manga_list_comments
for each row execute function public.validate_user_manga_list_comment_scope();

create or replace function public.set_user_manga_list_comment_reaction(
  p_comment_id uuid,
  p_reaction text default 'none'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_existing text;
  v_next text;
  v_delta_like integer := 0;
  v_delta_dislike integer := 0;
  v_likes integer := 0;
  v_dislikes integer := 0;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  perform 1
  from public.user_manga_list_comments lc
  where lc.id = p_comment_id
    and lc.is_active = true
  for update;

  if not found then
    raise exception 'Yorum bulunamadi veya aktif degil.';
  end if;

  v_next := lower(trim(coalesce(p_reaction, 'none')));
  if v_next not in ('like', 'dislike', 'none') then
    raise exception 'Gecersiz reaksiyon tipi.';
  end if;

  select cr.reaction
  into v_existing
  from public.user_manga_list_comment_reactions cr
  where cr.comment_id = p_comment_id
    and cr.user_id = v_actor_id
  for update;

  if v_existing is null then
    if v_next = 'like' then
      insert into public.user_manga_list_comment_reactions (comment_id, user_id, reaction)
      values (p_comment_id, v_actor_id, 'like');
      v_delta_like := 1;
    elsif v_next = 'dislike' then
      insert into public.user_manga_list_comment_reactions (comment_id, user_id, reaction)
      values (p_comment_id, v_actor_id, 'dislike');
      v_delta_dislike := 1;
    end if;
  else
    if v_next = 'none' then
      delete from public.user_manga_list_comment_reactions
      where comment_id = p_comment_id
        and user_id = v_actor_id;

      if v_existing = 'like' then
        v_delta_like := -1;
      elsif v_existing = 'dislike' then
        v_delta_dislike := -1;
      end if;
    elsif v_next <> v_existing then
      update public.user_manga_list_comment_reactions
      set reaction = v_next
      where comment_id = p_comment_id
        and user_id = v_actor_id;

      if v_existing = 'like' then
        v_delta_like := v_delta_like - 1;
      elsif v_existing = 'dislike' then
        v_delta_dislike := v_delta_dislike - 1;
      end if;

      if v_next = 'like' then
        v_delta_like := v_delta_like + 1;
      elsif v_next = 'dislike' then
        v_delta_dislike := v_delta_dislike + 1;
      end if;
    end if;
  end if;

  if v_delta_like <> 0 or v_delta_dislike <> 0 then
    update public.user_manga_list_comments
    set
      likes_count = greatest(coalesce(likes_count, 0) + v_delta_like, 0),
      dislikes_count = greatest(coalesce(dislikes_count, 0) + v_delta_dislike, 0),
      updated_at = now()
    where id = p_comment_id
    returning likes_count, dislikes_count into v_likes, v_dislikes;
  else
    select coalesce(likes_count, 0), coalesce(dislikes_count, 0)
    into v_likes, v_dislikes
    from public.user_manga_list_comments
    where id = p_comment_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'comment_id', p_comment_id,
    'reaction', case when v_next = 'none' then null else v_next end,
    'is_liked', v_next = 'like',
    'is_disliked', v_next = 'dislike',
    'likes_count', coalesce(v_likes, 0),
    'dislikes_count', coalesce(v_dislikes, 0)
  );
end;
$$;

create or replace function public.set_user_manga_list_rating(
  p_list_id uuid,
  p_rating integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_avg numeric(3,2);
  v_count integer;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Puan 1 ile 5 arasinda olmalidir.';
  end if;

  perform 1
  from public.user_manga_lists uml
  where uml.id = p_list_id
    and (
      uml.is_public = true
      or uml.owner_id = v_actor_id
      or public.is_admin()
    );

  if not found then
    raise exception 'Liste bulunamadi veya goruntuleme izniniz yok.';
  end if;

  insert into public.user_manga_list_ratings (list_id, user_id, rating)
  values (p_list_id, v_actor_id, p_rating)
  on conflict (list_id, user_id)
  do update set
    rating = excluded.rating,
    updated_at = now();

  perform public.refresh_user_manga_list_stats(p_list_id);

  select uml.rating_avg, uml.ratings_count
  into v_avg, v_count
  from public.user_manga_lists uml
  where uml.id = p_list_id;

  return jsonb_build_object(
    'success', true,
    'list_id', p_list_id,
    'user_rating', p_rating,
    'rating_avg', coalesce(v_avg, 0),
    'ratings_count', coalesce(v_count, 0)
  );
end;
$$;

create or replace function public.create_user_manga_list(
  p_title text,
  p_description text default '',
  p_is_public boolean default true,
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
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if char_length(v_title) < 3 or char_length(v_title) > 80 then
    raise exception 'Liste basligi 3-80 karakter arasinda olmalidir.';
  end if;

  insert into public.user_manga_lists (
    owner_id,
    title,
    description,
    is_public
  )
  values (
    v_actor_id,
    v_title,
    left(coalesce(p_description, ''), 1200),
    coalesce(p_is_public, true)
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
  created_at timestamptz
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
    select
      lr.list_id,
      count(*)::integer as rating_count
    from public.user_manga_list_ratings lr
    join params p on true
    where lr.updated_at >= p.window_start
    group by lr.list_id
  ),
  comment_period as (
    select
      lc.list_id,
      count(*)::integer as comment_count
    from public.user_manga_list_comments lc
    join params p on true
    where lc.is_active = true
      and lc.created_at >= p.window_start
    group by lc.list_id
  ),
  ranked as (
    select
      uml.id as list_id,
      uml.title,
      uml.description,
      uml.owner_id,
      u.username as owner_username,
      u.avatar_url as owner_avatar_url,
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
      uml.created_at
    from public.user_manga_lists uml
    join public.users u
      on u.id = uml.owner_id
     and u.is_active = true
    left join public.mangas m
      on m.id = uml.cover_manga_id
     and m.is_active = true
     and m.is_approved = true
    left join rating_period rp
      on rp.list_id = uml.id
    left join comment_period cp
      on cp.list_id = uml.id
    where uml.is_public = true
  )
  select
    r.list_id,
    r.title,
    r.description,
    r.owner_id,
    r.owner_username,
    r.owner_avatar_url,
    r.cover_manga_id,
    r.cover_manga_title,
    r.cover_manga_slug,
    r.cover_image_url,
    r.items_count,
    r.ratings_count,
    r.rating_avg,
    r.comments_count,
    r.period_rating_count,
    r.period_comment_count,
    r.score,
    r.created_at
  from ranked r
  order by r.score desc, r.rating_avg desc, r.ratings_count desc, r.created_at desc
  limit (select safe_limit from params);
$$;

alter table public.user_manga_lists enable row level security;
alter table public.user_manga_list_items enable row level security;
alter table public.user_manga_list_ratings enable row level security;
alter table public.user_manga_list_comments enable row level security;
alter table public.user_manga_list_comment_reactions enable row level security;

drop policy if exists user_manga_lists_select_rule on public.user_manga_lists;
create policy user_manga_lists_select_rule
  on public.user_manga_lists
  for select
  using (
    is_public = true
    or owner_id = public.current_public_user_id()
    or public.is_admin()
  );

drop policy if exists user_manga_lists_insert_self on public.user_manga_lists;
create policy user_manga_lists_insert_self
  on public.user_manga_lists
  for insert
  with check (owner_id = public.current_public_user_id());

drop policy if exists user_manga_lists_update_owner_or_admin on public.user_manga_lists;
create policy user_manga_lists_update_owner_or_admin
  on public.user_manga_lists
  for update
  using (owner_id = public.current_public_user_id() or public.is_admin())
  with check (owner_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_manga_lists_delete_owner_or_admin on public.user_manga_lists;
create policy user_manga_lists_delete_owner_or_admin
  on public.user_manga_lists
  for delete
  using (owner_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_manga_list_items_select_rule on public.user_manga_list_items;
create policy user_manga_list_items_select_rule
  on public.user_manga_list_items
  for select
  using (
    exists (
      select 1
      from public.user_manga_lists uml
      where uml.id = list_id
        and (
          uml.is_public = true
          or uml.owner_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists user_manga_list_items_insert_owner_or_admin on public.user_manga_list_items;
create policy user_manga_list_items_insert_owner_or_admin
  on public.user_manga_list_items
  for insert
  with check (
    exists (
      select 1
      from public.user_manga_lists uml
      where uml.id = list_id
        and (
          uml.owner_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists user_manga_list_items_update_owner_or_admin on public.user_manga_list_items;
create policy user_manga_list_items_update_owner_or_admin
  on public.user_manga_list_items
  for update
  using (
    exists (
      select 1
      from public.user_manga_lists uml
      where uml.id = list_id
        and (
          uml.owner_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.user_manga_lists uml
      where uml.id = list_id
        and (
          uml.owner_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists user_manga_list_items_delete_owner_or_admin on public.user_manga_list_items;
create policy user_manga_list_items_delete_owner_or_admin
  on public.user_manga_list_items
  for delete
  using (
    exists (
      select 1
      from public.user_manga_lists uml
      where uml.id = list_id
        and (
          uml.owner_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists user_manga_list_ratings_select_rule on public.user_manga_list_ratings;
create policy user_manga_list_ratings_select_rule
  on public.user_manga_list_ratings
  for select
  using (
    exists (
      select 1
      from public.user_manga_lists uml
      where uml.id = list_id
        and (
          uml.is_public = true
          or uml.owner_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists user_manga_list_ratings_insert_self on public.user_manga_list_ratings;
create policy user_manga_list_ratings_insert_self
  on public.user_manga_list_ratings
  for insert
  with check (
    user_id = public.current_public_user_id()
    and exists (
      select 1
      from public.user_manga_lists uml
      where uml.id = list_id
        and (
          uml.is_public = true
          or uml.owner_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists user_manga_list_ratings_update_self_or_admin on public.user_manga_list_ratings;
create policy user_manga_list_ratings_update_self_or_admin
  on public.user_manga_list_ratings
  for update
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_manga_list_ratings_delete_self_or_admin on public.user_manga_list_ratings;
create policy user_manga_list_ratings_delete_self_or_admin
  on public.user_manga_list_ratings
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_manga_list_comments_select_rule on public.user_manga_list_comments;
create policy user_manga_list_comments_select_rule
  on public.user_manga_list_comments
  for select
  using (
    (
      is_active = true
      and exists (
        select 1
        from public.user_manga_lists uml
        where uml.id = list_id
          and (
            uml.is_public = true
            or uml.owner_id = public.current_public_user_id()
            or public.is_admin()
          )
      )
    )
    or public.is_admin()
  );

drop policy if exists user_manga_list_comments_insert_self on public.user_manga_list_comments;
create policy user_manga_list_comments_insert_self
  on public.user_manga_list_comments
  for insert
  with check (
    author_id = public.current_public_user_id()
    and exists (
      select 1
      from public.user_manga_lists uml
      where uml.id = list_id
        and (
          uml.is_public = true
          or uml.owner_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists user_manga_list_comments_update_rule on public.user_manga_list_comments;
create policy user_manga_list_comments_update_rule
  on public.user_manga_list_comments
  for update
  using (
    author_id = public.current_public_user_id()
    or public.is_admin()
    or public.is_user_manga_list_owner(list_id)
  )
  with check (
    author_id = public.current_public_user_id()
    or public.is_admin()
    or public.is_user_manga_list_owner(list_id)
  );

drop policy if exists user_manga_list_comments_delete_rule on public.user_manga_list_comments;
create policy user_manga_list_comments_delete_rule
  on public.user_manga_list_comments
  for delete
  using (
    author_id = public.current_public_user_id()
    or public.is_admin()
    or public.is_user_manga_list_owner(list_id)
  );

drop policy if exists user_manga_list_comment_reactions_select_rule on public.user_manga_list_comment_reactions;
create policy user_manga_list_comment_reactions_select_rule
  on public.user_manga_list_comment_reactions
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_manga_list_comment_reactions_insert_self on public.user_manga_list_comment_reactions;
create policy user_manga_list_comment_reactions_insert_self
  on public.user_manga_list_comment_reactions
  for insert
  with check (user_id = public.current_public_user_id());

drop policy if exists user_manga_list_comment_reactions_update_self_or_admin on public.user_manga_list_comment_reactions;
create policy user_manga_list_comment_reactions_update_self_or_admin
  on public.user_manga_list_comment_reactions
  for update
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_manga_list_comment_reactions_delete_self_or_admin on public.user_manga_list_comment_reactions;
create policy user_manga_list_comment_reactions_delete_self_or_admin
  on public.user_manga_list_comment_reactions
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

revoke all on function public.is_user_manga_list_owner(uuid) from public;
grant execute on function public.is_user_manga_list_owner(uuid) to authenticated;

revoke all on function public.refresh_user_manga_list_stats(uuid) from public;
revoke all on function public.sync_user_manga_list_stats() from public;
revoke all on function public.validate_user_manga_list_comment_scope() from public;

revoke all on function public.set_user_manga_list_comment_reaction(uuid, text) from public;
grant execute on function public.set_user_manga_list_comment_reaction(uuid, text) to authenticated;

revoke all on function public.set_user_manga_list_rating(uuid, integer) from public;
grant execute on function public.set_user_manga_list_rating(uuid, integer) to authenticated;

revoke all on function public.create_user_manga_list(text, text, boolean, uuid[]) from public;
grant execute on function public.create_user_manga_list(text, text, boolean, uuid[]) to authenticated;

revoke all on function public.get_top_user_manga_lists(text, integer) from public;
grant execute on function public.get_top_user_manga_lists(text, integer) to anon, authenticated;

commit;
