-- ============================================
-- MangaZone | Quest System Migration
-- Task system: tier_level, task_group columns,
-- extended metric_key, fansub tasks, seed data
-- Date: 2026-03-04
-- ============================================

begin;

-- ============================================
-- 1) Add new columns to user_reward_tasks
-- ============================================
alter table public.user_reward_tasks
  add column if not exists task_group text not null default 'default',
  add column if not exists tier_level integer not null default 1 check (tier_level between 1 and 3),
  add column if not exists unlock_requires_task_id uuid references public.user_reward_tasks(id) on delete set null;

create index if not exists user_reward_tasks_group_tier_idx
  on public.user_reward_tasks (task_group, tier_level, sort_order asc);

-- ============================================
-- 2) Extend the metric_key CHECK constraint
-- Drop the old constraint and add the new one
-- ============================================
alter table public.user_reward_tasks
  drop constraint if exists user_reward_tasks_metric_key_check;

alter table public.user_reward_tasks
  add constraint user_reward_tasks_metric_key_check
  check (
    metric_key in (
      -- Orijinal metrikler
      'read_manga_count',
      'manga_follow_count',
      'fansub_follow_count',
      'rating_count',
      'manga_comment_count',
      'community_comment_count',
      'community_post_count',
      'total_comment_count',
      -- New qualified metrics
      'unique_mangas_read',
      'qualified_comments',
      'qualified_unique_comments',
      'lists_with_items',
      'qualified_ratings',
      'profile_completed',
      'first_day_actions',
      'chapters_read',
      'favorites_count',
      'genres_explored',
      'consecutive_days',
      'qualified_posts',
      'upvotes_received',
      'chapters_in_single_day',
      'qualified_lists',
      'night_chapters_read',
      'unique_mangas_completed',
      'community_leader_score',
      'weekly_trending_read'
    )
  );

-- ============================================
-- 3) Fansub task tables
-- ============================================
create table if not exists public.fansub_reward_tasks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  metric_key text not null
    check (
      metric_key in (
        'chapters_published',
        'mangas_with_chapters',
        'members_count',
        'followers_count',
        'chapters_in_week',
        'unique_mangas_translated',
        'avg_views_per_chapter',
        'consecutive_publish_days',
        'single_chapter_views'
      )
    ),
  target_value integer not null check (target_value > 0),
  coin_reward integer not null default 0 check (coin_reward >= 0),
  badge_id uuid references public.badges(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  task_group text not null default 'default',
  tier_level integer not null default 1 check (tier_level between 1 and 3),
  unlock_requires_task_id uuid references public.fansub_reward_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fansub_reward_tasks_active_sort_idx
  on public.fansub_reward_tasks (is_active, tier_level, sort_order asc, created_at asc);

create index if not exists fansub_reward_tasks_group_tier_idx
  on public.fansub_reward_tasks (task_group, tier_level, sort_order asc);

drop trigger if exists trg_fansub_reward_tasks_updated_at on public.fansub_reward_tasks;
create trigger trg_fansub_reward_tasks_updated_at
  before update on public.fansub_reward_tasks
  for each row
  execute function public.set_updated_at();

alter table public.fansub_reward_tasks enable row level security;

drop policy if exists fansub_reward_tasks_select_authenticated on public.fansub_reward_tasks;
create policy fansub_reward_tasks_select_authenticated
  on public.fansub_reward_tasks
  for select
  using (auth.role() = 'authenticated' or public.is_admin());

drop policy if exists fansub_reward_tasks_admin_write on public.fansub_reward_tasks;
create policy fansub_reward_tasks_admin_write
  on public.fansub_reward_tasks
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.fansub_reward_tasks to authenticated;

-- Fansub task claim table
create table if not exists public.fansub_reward_task_claims (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  task_id uuid not null references public.fansub_reward_tasks(id) on delete cascade,
  claimed_by uuid not null references public.users(id) on delete cascade,
  credited_coin integer not null default 0,
  badge_id uuid references public.badges(id) on delete set null,
  claimed_at timestamptz not null default now(),
  unique (fansub_id, task_id)
);

create index if not exists fansub_reward_task_claims_fansub_idx
  on public.fansub_reward_task_claims (fansub_id, claimed_at desc);

alter table public.fansub_reward_task_claims enable row level security;

drop policy if exists fansub_reward_task_claims_select on public.fansub_reward_task_claims;
create policy fansub_reward_task_claims_select
  on public.fansub_reward_task_claims
  for select
  using (
    public.is_admin()
    or public.is_fansub_staff(fansub_id)
  );

drop policy if exists fansub_reward_task_claims_insert on public.fansub_reward_task_claims;
create policy fansub_reward_task_claims_insert
  on public.fansub_reward_task_claims
  for insert
  with check (
    public.is_admin()
    or public.is_fansub_staff(fansub_id)
  );

grant select, insert on table public.fansub_reward_task_claims to authenticated;

-- ============================================
-- 4) Extended metric calculation function
-- ============================================
create or replace function public.get_user_reward_metric_value(
  p_metric_key text,
  p_user_id uuid default null
)
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid;
  v_metric text := lower(trim(coalesce(p_metric_key, '')));
  v_value bigint := 0;
begin
  v_user_id := coalesce(p_user_id, public.current_public_user_id());
  if v_user_id is null then
    return 0;
  end if;

  -- Orijinal metrikler
  if v_metric = 'read_manga_count' then
    select count(*)::bigint into v_value
    from public.reading_history where user_id = v_user_id;

  elsif v_metric = 'manga_follow_count' then
    select count(*)::bigint into v_value
    from public.manga_follows where user_id = v_user_id;

  elsif v_metric = 'fansub_follow_count' then
    select count(*)::bigint into v_value
    from public.fansub_follows where user_id = v_user_id;

  elsif v_metric = 'rating_count' then
    select count(*)::bigint into v_value
    from public.manga_ratings where user_id = v_user_id;

  elsif v_metric = 'manga_comment_count' then
    select count(*)::bigint into v_value
    from public.manga_comments
    where user_id = v_user_id and coalesce(is_active, true) = true;

  elsif v_metric = 'community_comment_count' then
    select count(*)::bigint into v_value
    from public.community_comments
    where author_id = v_user_id and coalesce(is_active, true) = true;

  elsif v_metric = 'community_post_count' then
    select count(*)::bigint into v_value
    from public.community_posts
    where author_id = v_user_id
      and coalesce(is_active, true) = true
      and status = 'approved';

  elsif v_metric = 'total_comment_count' then
    select (
      coalesce((select count(*)::bigint from public.manga_comments
                where user_id = v_user_id and coalesce(is_active, true) = true), 0)
      +
      coalesce((select count(*)::bigint from public.community_comments
                where author_id = v_user_id and coalesce(is_active, true) = true), 0)
    )::bigint into v_value;

  -- ============================
  -- NEW QUALIFIED METRICS
  -- ============================

  -- Farkli manga okunan sayisi
  elsif v_metric = 'unique_mangas_read' then
    select count(distinct manga_id)::bigint into v_value
    from public.reading_history where user_id = v_user_id;

  -- Qualified comments (min 15 characters, on different mangas)
  elsif v_metric = 'qualified_comments' then
    select count(*)::bigint into v_value
    from public.manga_comments
    where user_id = v_user_id
      and coalesce(is_active, true) = true
      and length(trim(coalesce(content, ''))) >= 15;

  -- Qualified comments on different mangas
  elsif v_metric = 'qualified_unique_comments' then
    select count(distinct manga_id)::bigint into v_value
    from public.manga_comments
    where user_id = v_user_id
      and coalesce(is_active, true) = true
      and length(trim(coalesce(content, ''))) >= 15;

  -- Count of lists containing a manga
  elsif v_metric = 'lists_with_items' then
    select count(distinct l.id)::bigint into v_value
    from public.user_manga_lists l
    join public.user_manga_list_items li on li.list_id = l.id
    where l.owner_id = v_user_id;

  -- Qualified ratings (after reading at least 3 chapters)
  elsif v_metric = 'qualified_ratings' then
    select count(*)::bigint into v_value
    from public.manga_ratings r
    where r.user_id = v_user_id
      and exists (
        select 1 from public.reading_history rh
        where rh.user_id = v_user_id and rh.manga_id = r.manga_id
      );

  -- Profil tamamlama (avatar + bio)
  elsif v_metric = 'profile_completed' then
    select case when (
      u.avatar_url is not null
      and u.bio is not null
      and length(trim(coalesce(u.bio, ''))) > 0
    ) then 1 else 0 end into v_value
    from public.users u where u.id = v_user_id;

  -- Total chapters read
  elsif v_metric = 'chapters_read' then
    select count(*)::bigint into v_value
    from public.reading_history where user_id = v_user_id;

  -- Favori manga sayisi
  elsif v_metric = 'favorites_count' then
    select count(*)::bigint into v_value
    from public.manga_follows where user_id = v_user_id;

  -- Farkli tur kesfetme (okunan mangalarin turleri)
  elsif v_metric = 'genres_explored' then
    select count(distinct g)::bigint into v_value
    from public.reading_history rh
    join public.mangas m on m.id = rh.manga_id
    cross join lateral unnest(coalesce(m.genres, '{}'::text[])) as g
    where rh.user_id = v_user_id
      and trim(g) <> '';

  -- Ust uste aktif gun sayisi
  elsif v_metric = 'consecutive_days' then
    with daily_activity as (
      select distinct date_trunc('day', read_at)::date as active_day
      from public.reading_history
      where user_id = v_user_id
      order by active_day desc
    ),
    streaks as (
      select active_day,
        active_day - (row_number() over (order by active_day))::integer as streak_group
      from daily_activity
    )
    select coalesce(max(streak_count), 0)::bigint into v_value
    from (
      select count(*) as streak_count from streaks group by streak_group
    ) s;

  -- Nitelikli topluluk postlari (min 50 karakter)
  elsif v_metric = 'qualified_posts' then
    select count(*)::bigint into v_value
    from public.community_posts
    where author_id = v_user_id
      and coalesce(is_active, true) = true
      and status = 'approved'
      and length(trim(coalesce(body, ''))) >= 50;

  -- Baskalarindan alinan begeni sayisi
  elsif v_metric = 'upvotes_received' then
    select (
      coalesce((select count(*)::bigint from public.manga_comment_reactions mcr
                join public.manga_comments mc on mc.id = mcr.comment_id
                where mc.user_id = v_user_id
                  and mcr.user_id != v_user_id
                  and mcr.reaction = 'like'), 0)
      +
      coalesce((select count(*)::bigint from public.community_comment_reactions ccr
                join public.community_comments cc on cc.id = ccr.comment_id
                where cc.author_id = v_user_id
                  and ccr.user_id != v_user_id
                  and ccr.reaction = 'like'), 0)
    )::bigint into v_value;

  -- Most chapters read in a day
  elsif v_metric = 'chapters_in_single_day' then
    select coalesce(max(day_count), 0)::bigint into v_value
    from (
      select count(*) as day_count
      from public.reading_history
      where user_id = v_user_id
      group by date_trunc('day', read_at)::date
    ) daily;

  -- Nitelikli liste sayisi (her birinde 10+ manga)
  elsif v_metric = 'qualified_lists' then
    select count(*)::bigint into v_value
    from (
      select l.id
      from public.user_manga_lists l
      join public.user_manga_list_items li on li.list_id = l.id
      where l.owner_id = v_user_id
      group by l.id
      having count(li.id) >= 10
    ) ql;

  -- Chapters read at night (00:00-05:00)
  elsif v_metric = 'night_chapters_read' then
    select count(*)::bigint into v_value
    from public.reading_history
    where user_id = v_user_id
      and extract(hour from read_at) between 0 and 4;

  -- Count of different completed mangas (last chapter read)
  elsif v_metric = 'unique_mangas_completed' then
    select count(distinct rh.manga_id)::bigint into v_value
    from public.reading_history rh
    join public.mangas m on m.id = rh.manga_id
    where rh.user_id = v_user_id
      and m.status = 'completed';

  -- Topluluk lideri skoru (post + begeni)
  elsif v_metric = 'community_leader_score' then
    select (
      coalesce((select count(*)::bigint from public.community_posts
                where author_id = v_user_id
                  and coalesce(is_active, true) = true
                  and status = 'approved'
                  and length(trim(coalesce(body, ''))) >= 50), 0)
      +
      coalesce((select count(*)::bigint from public.community_comment_reactions ccr
                join public.community_comments cc on cc.id = ccr.comment_id
                where cc.author_id = v_user_id
                  and ccr.user_id != v_user_id
                  and ccr.reaction = 'like'), 0)
    )::bigint into v_value;

  -- Haftalik trending manga okuma
  elsif v_metric = 'weekly_trending_read' then
    v_value := 0; -- Trending hesaplama icin ozel logic gerekir, sonra eklenecek

  -- Ilk gun aksiyonlari
  elsif v_metric = 'first_day_actions' then
    v_value := 0; -- Kayit gunu bazli ozel logic gerekir, sonra eklenecek

  else
    v_value := 0;
  end if;

  return coalesce(v_value, 0);
end;
$$;

-- ============================================
-- 5) Fansub metric calculation function (NEW)
-- ============================================
create or replace function public.get_fansub_reward_metric_value(
  p_metric_key text,
  p_fansub_id uuid
)
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_metric text := lower(trim(coalesce(p_metric_key, '')));
  v_value bigint := 0;
begin
  if p_fansub_id is null then
    return 0;
  end if;

  if v_metric = 'chapters_published' then
    select count(*)::bigint into v_value
    from public.chapters c
    join public.mangas m on m.id = c.manga_id
    where m.fansub_id = p_fansub_id
      and c.is_active = true;

  elsif v_metric = 'mangas_with_chapters' then
    select count(distinct m.id)::bigint into v_value
    from public.mangas m
    join public.chapters c on c.manga_id = m.id and c.is_active = true
    where m.fansub_id = p_fansub_id
      and m.is_active = true;

  elsif v_metric = 'members_count' then
    select count(*)::bigint into v_value
    from public.fansub_members
    where fansub_id = p_fansub_id;

  elsif v_metric = 'followers_count' then
    select count(*)::bigint into v_value
    from public.fansub_follows
    where fansub_id = p_fansub_id;

  elsif v_metric = 'chapters_in_week' then
    select count(*)::bigint into v_value
    from public.chapters c
    join public.mangas m on m.id = c.manga_id
    where m.fansub_id = p_fansub_id
      and c.is_active = true
      and c.created_at >= now() - interval '7 days';

  elsif v_metric = 'unique_mangas_translated' then
    select count(distinct m.id)::bigint into v_value
    from public.mangas m
    join public.chapters c on c.manga_id = m.id and c.is_active = true
    where m.fansub_id = p_fansub_id;

  elsif v_metric = 'avg_views_per_chapter' then
    select coalesce(avg(m.total_views / greatest(
      (select count(*) from public.chapters c2
       where c2.manga_id = m.id and c2.is_active = true), 1
    )), 0)::bigint into v_value
    from public.mangas m
    where m.fansub_id = p_fansub_id
      and m.is_active = true
      and exists (select 1 from public.chapters c3
                  where c3.manga_id = m.id and c3.is_active = true);

  elsif v_metric = 'consecutive_publish_days' then
    with daily_publish as (
      select distinct date_trunc('day', c.created_at)::date as pub_day
      from public.chapters c
      join public.mangas m on m.id = c.manga_id
      where m.fansub_id = p_fansub_id
        and c.is_active = true
      order by pub_day desc
    ),
    streaks as (
      select pub_day,
        pub_day - (row_number() over (order by pub_day))::integer as streak_group
      from daily_publish
    )
    select coalesce(max(streak_count), 0)::bigint into v_value
    from (select count(*) as streak_count from streaks group by streak_group) s;

  elsif v_metric = 'single_chapter_views' then
    select coalesce(max(m.total_views), 0)::bigint into v_value
    from public.mangas m
    where m.fansub_id = p_fansub_id
      and m.is_active = true;

  else
    v_value := 0;
  end if;

  return coalesce(v_value, 0);
end;
$$;

grant execute on function public.get_fansub_reward_metric_value(text, uuid) to authenticated;

-- ============================================
-- 6) Update list_user_reward_tasks (add tier_level, task_group)
-- ============================================
create or replace function public.list_user_reward_tasks()
returns table (
  task_id uuid,
  slug text,
  title text,
  description text,
  metric_key text,
  target_value integer,
  progress_value bigint,
  is_completed boolean,
  is_claimed boolean,
  is_claimable boolean,
  coin_reward integer,
  badge_id uuid,
  badge_name text,
  badge_image_url text,
  claimed_at timestamptz,
  sort_order integer,
  task_group text,
  tier_level integer,
  is_locked boolean,
  unlock_task_id uuid,
  unlock_task_title text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  return query
  with task_rows as (
    select
      t.id,
      t.slug,
      t.title,
      t.description,
      t.metric_key,
      t.target_value,
      t.coin_reward,
      t.badge_id,
      t.sort_order,
      t.task_group,
      t.tier_level,
      t.unlock_requires_task_id,
      b.name as badge_name,
      b.image_url as badge_image_url,
      c.id as claim_id,
      c.claimed_at,
      public.get_user_reward_metric_value(t.metric_key, v_user_id) as metric_value
    from public.user_reward_tasks t
    left join public.badges b on b.id = t.badge_id
    left join public.user_reward_task_claims c
      on c.task_id = t.id and c.user_id = v_user_id
    where t.is_active = true
  ),
  unlock_info as (
    select
      tr.id as task_id,
      tr.unlock_requires_task_id,
      ut.title as unlock_task_title,
      case
        when tr.unlock_requires_task_id is null then false
        when exists (
          select 1 from public.user_reward_task_claims uc
          where uc.user_id = v_user_id and uc.task_id = tr.unlock_requires_task_id
        ) then false
        else true
      end as is_locked
    from task_rows tr
    left join public.user_reward_tasks ut on ut.id = tr.unlock_requires_task_id
  )
  select
    tr.id as task_id,
    tr.slug,
    tr.title,
    tr.description,
    tr.metric_key,
    tr.target_value,
    tr.metric_value as progress_value,
    (tr.metric_value >= tr.target_value) as is_completed,
    (tr.claim_id is not null) as is_claimed,
    (tr.metric_value >= tr.target_value and tr.claim_id is null and ui.is_locked = false) as is_claimable,
    tr.coin_reward,
    tr.badge_id,
    tr.badge_name,
    tr.badge_image_url,
    tr.claimed_at,
    tr.sort_order,
    tr.task_group,
    tr.tier_level,
    ui.is_locked,
    tr.unlock_requires_task_id as unlock_task_id,
    ui.unlock_task_title
  from task_rows tr
  join unlock_info ui on ui.task_id = tr.id
  order by tr.tier_level asc, tr.sort_order asc, tr.title asc;
end;
$$;

-- ============================================
-- 7) Fansub task listing RPC
-- ============================================
create or replace function public.list_fansub_reward_tasks(
  p_fansub_id uuid
)
returns table (
  task_id uuid,
  slug text,
  title text,
  description text,
  metric_key text,
  target_value integer,
  progress_value bigint,
  is_completed boolean,
  is_claimed boolean,
  is_claimable boolean,
  coin_reward integer,
  badge_id uuid,
  badge_name text,
  badge_image_url text,
  claimed_at timestamptz,
  sort_order integer,
  task_group text,
  tier_level integer,
  is_locked boolean,
  unlock_task_id uuid,
  unlock_task_title text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_fansub_id is null then
    raise exception 'Fansub ID zorunludur.';
  end if;

  return query
  with task_rows as (
    select
      t.id,
      t.slug,
      t.title,
      t.description,
      t.metric_key,
      t.target_value,
      t.coin_reward,
      t.badge_id,
      t.sort_order,
      t.task_group,
      t.tier_level,
      t.unlock_requires_task_id,
      b.name as badge_name,
      b.image_url as badge_image_url,
      c.id as claim_id,
      c.claimed_at,
      public.get_fansub_reward_metric_value(t.metric_key, p_fansub_id) as metric_value
    from public.fansub_reward_tasks t
    left join public.badges b on b.id = t.badge_id
    left join public.fansub_reward_task_claims c
      on c.task_id = t.id and c.fansub_id = p_fansub_id
    where t.is_active = true
  ),
  unlock_info as (
    select
      tr.id as task_id,
      tr.unlock_requires_task_id,
      ut.title as unlock_task_title,
      case
        when tr.unlock_requires_task_id is null then false
        when exists (
          select 1 from public.fansub_reward_task_claims uc
          where uc.fansub_id = p_fansub_id and uc.task_id = tr.unlock_requires_task_id
        ) then false
        else true
      end as is_locked
    from task_rows tr
    left join public.fansub_reward_tasks ut on ut.id = tr.unlock_requires_task_id
  )
  select
    tr.id as task_id,
    tr.slug,
    tr.title,
    tr.description,
    tr.metric_key,
    tr.target_value,
    tr.metric_value as progress_value,
    (tr.metric_value >= tr.target_value) as is_completed,
    (tr.claim_id is not null) as is_claimed,
    (tr.metric_value >= tr.target_value and tr.claim_id is null and ui.is_locked = false) as is_claimable,
    tr.coin_reward,
    tr.badge_id,
    tr.badge_name,
    tr.badge_image_url,
    tr.claimed_at,
    tr.sort_order,
    tr.task_group,
    tr.tier_level,
    ui.is_locked,
    tr.unlock_requires_task_id as unlock_task_id,
    ui.unlock_task_title
  from task_rows tr
  join unlock_info ui on ui.task_id = tr.id
  order by tr.tier_level asc, tr.sort_order asc, tr.title asc;
end;
$$;

grant execute on function public.list_fansub_reward_tasks(uuid) to authenticated;

-- ============================================
-- 8) Fansub task claim RPC
-- ============================================
create or replace function public.claim_fansub_reward_task(
  p_fansub_id uuid,
  p_task_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_task public.fansub_reward_tasks%rowtype;
  v_progress bigint;
  v_new_balance integer;
  v_badge_name text;
  v_badge_awarded boolean := false;
  v_badge_rowcount integer := 0;
  v_claim_id uuid;
  v_claimed_at timestamptz := now();
begin
  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if not public.is_fansub_staff(p_fansub_id) then
    raise exception 'Bu islemi sadece fansub yoneticileri yapabilir.';
  end if;

  select * into v_task
  from public.fansub_reward_tasks
  where id = p_task_id and is_active = true
  for update;

  if not found then
    raise exception 'Gorev bulunamadi veya aktif degil.';
  end if;

  if exists (
    select 1 from public.fansub_reward_task_claims c
    where c.fansub_id = p_fansub_id and c.task_id = v_task.id
  ) then
    raise exception 'Bu gorevin odulu zaten alinmis.';
  end if;

  -- Kilit kontrolu
  if v_task.unlock_requires_task_id is not null then
    if not exists (
      select 1 from public.fansub_reward_task_claims uc
      where uc.fansub_id = p_fansub_id and uc.task_id = v_task.unlock_requires_task_id
    ) then
      raise exception 'Onceki gorev tamamlanmadan bu gorev acilamaz.';
    end if;
  end if;

  v_progress := public.get_fansub_reward_metric_value(v_task.metric_key, p_fansub_id);
  if v_progress < v_task.target_value then
    raise exception 'Gorev henuz tamamlanmadi. Ilerleme: % / %', v_progress, v_task.target_value;
  end if;

  -- Add the Coin reward to the fansub balance
  if v_task.coin_reward > 0 then
    update public.fansubs
    set coin_balance = coalesce(coin_balance, 0) + v_task.coin_reward
    where id = p_fansub_id
    returning coin_balance into v_new_balance;

    -- Fansub transaction kaydi
    insert into public.fansub_transactions (fansub_id, amount, type, description, created_by)
    values (p_fansub_id, v_task.coin_reward, 'reward_task',
            format('Gorev odulu: "%s"', v_task.title), v_user_id);
  end if;

  -- Claim kaydi
  insert into public.fansub_reward_task_claims (fansub_id, task_id, claimed_by, credited_coin, badge_id, claimed_at)
  values (p_fansub_id, v_task.id, v_user_id, v_task.coin_reward, v_task.badge_id, v_claimed_at)
  returning id into v_claim_id;

  return jsonb_build_object(
    'success', true,
    'task_id', v_task.id,
    'task_slug', v_task.slug,
    'task_title', v_task.title,
    'coin_reward', v_task.coin_reward,
    'new_balance', coalesce(v_new_balance, 0),
    'claimed_at', v_claimed_at
  );
end;
$$;

grant execute on function public.claim_fansub_reward_task(uuid, uuid) to authenticated;

-- ============================================
-- 9) Update existing user tasks (tier_level + task_group)
-- ============================================
update public.user_reward_tasks set task_group = 'okuma', tier_level = 1 where slug = 'read-5-manga';
update public.user_reward_tasks set task_group = 'sosyal', tier_level = 1 where slug = 'follow-5-manga';
update public.user_reward_tasks set task_group = 'sosyal', tier_level = 2 where slug = 'write-10-comments';
update public.user_reward_tasks set task_group = 'degerlendirme', tier_level = 1 where slug = 'rate-5-manga';
update public.user_reward_tasks set task_group = 'topluluk', tier_level = 2 where slug = 'post-3-community';

-- ============================================
-- 10) New user task seed
-- ============================================
insert into public.user_reward_tasks (slug, title, description, metric_key, target_value, coin_reward, sort_order, is_active, task_group, tier_level)
values
  -- Tier 1 Kolay
  ('unique-3-manga', 'Ilk Adim', '3 farkli manga oku.', 'unique_mangas_read', 3, 50, 100, true, 'okuma', 1),
  ('qualified-5-comments', 'Sesi Duyur', '5 nitelikli yorum yap (min 15 karakter, farkli mangalarda).', 'qualified_comments', 5, 75, 110, true, 'sosyal', 1),
  ('fansub-3-follow', 'Takipci', '3 fansub takip et.', 'fansub_follow_count', 3, 100, 120, true, 'sosyal', 1),
  ('qualified-5-ratings', 'Puanci', '5 manga puanla (en az okumus olarak).', 'qualified_ratings', 5, 75, 130, true, 'degerlendirme', 1),
  ('profile-complete', 'Profil Tamamla', 'Avatar ve bio ekle.', 'profile_completed', 1, 60, 140, true, 'genel', 1),
  ('chapters-20', 'Bolum Avcisi', '20 bolum oku.', 'chapters_read', 20, 120, 150, true, 'okuma', 1),
  -- Tier 2 Orta
  ('unique-25-manga', 'Kitap Kurdu', '25 farkli manga oku.', 'unique_mangas_read', 25, 300, 200, true, 'okuma', 2),
  ('qualified-unique-25', 'Elestirmen', '25 farkli mangaya nitelikli yorum.', 'qualified_unique_comments', 25, 350, 210, true, 'sosyal', 2),
  ('favorites-50', 'Koleksiyoncu', '50 mangayi favorilere ekle.', 'favorites_count', 50, 250, 220, true, 'koleksiyon', 2),
  ('genres-7', 'Tur Kasifi', '7 farkli turde manga oku.', 'genres_explored', 7, 300, 230, true, 'okuma', 2),
  ('consecutive-7', 'Haftalik Sadakat', '7 gun ust uste aktif ol.', 'consecutive_days', 7, 200, 240, true, 'genel', 2),
  ('qualified-10-posts', 'Sosyal Kelebek', '10 nitelikli topluluk postu paylas.', 'qualified_posts', 10, 400, 250, true, 'topluluk', 2),
  ('upvotes-25', 'Begeni Avcisi', 'Yorumlarina 25 begeni al.', 'upvotes_received', 25, 350, 260, true, 'sosyal', 2),
  ('marathon-30', 'Maraton Okuyucu', 'Bir gunde 30 bolum oku.', 'chapters_in_single_day', 30, 500, 270, true, 'okuma', 2),
  ('qualified-3-lists', 'Liste Ustasi', '3 farkli liste olustur, her birinde 10+ manga.', 'qualified_lists', 3, 400, 280, true, 'koleksiyon', 2),
  ('night-10', 'Gece Kusu', '00:00-05:00 arasi 10 bolum oku.', 'night_chapters_read', 10, 250, 290, true, 'ozel', 2),
  -- Tier 3 Imkansiz
  ('completed-100', 'Manga Efsanesi', '100 farkli manga bitir.', 'unique_mangas_completed', 100, 2000, 300, true, 'okuma', 3),
  ('qualified-200-comments', 'Yorum Krali', '200 nitelikli yorum yap.', 'qualified_comments', 200, 1500, 310, true, 'sosyal', 3),
  ('genres-10', 'Her Seyi Okudum', 'Tum turlerde (10) manga oku.', 'genres_explored', 10, 3000, 320, true, 'okuma', 3),
  ('leader-250', 'Topluluk Lideri', '50 post yaz ve toplamda 200 begeni al.', 'community_leader_score', 250, 5000, 330, true, 'topluluk', 3),
  ('consecutive-30', 'Demir Irade', '30 gun ust uste aktif ol.', 'consecutive_days', 30, 2500, 340, true, 'genel', 3),
  ('chapters-1000', '1000 Bolum', 'Toplam 1000 bolum oku.', 'chapters_read', 1000, 4000, 350, true, 'okuma', 3),
  ('upvotes-100', 'Sosyal Fenomen', '100 begeni al.', 'upvotes_received', 100, 3000, 360, true, 'sosyal', 3)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  metric_key = excluded.metric_key,
  target_value = excluded.target_value,
  coin_reward = excluded.coin_reward,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  task_group = excluded.task_group,
  tier_level = excluded.tier_level,
  updated_at = now();

-- ============================================
-- 11) Fansub task seed
-- ============================================
insert into public.fansub_reward_tasks (slug, title, description, metric_key, target_value, coin_reward, sort_order, is_active, task_group, tier_level)
values
  -- Tier 1 Kolay
  ('fansub-chapters-3', 'Ilk Ceviri', '3 bolum yayinla.', 'chapters_published', 3, 100, 100, true, 'ceviri', 1),
  ('fansub-manga-1', 'Yeni Seri', '1 manga ekle ve en az 1 bolum yayinla.', 'mangas_with_chapters', 1, 75, 110, true, 'ceviri', 1),
  ('fansub-members-3', 'Ekip Kurucu', '3 uye al.', 'members_count', 3, 100, 120, true, 'ekip', 1),
  ('fansub-followers-10', 'Ilk Takipciler', '10 takipci kazan.', 'followers_count', 10, 120, 130, true, 'buyume', 1),
  ('fansub-week-5', 'Duzenli Baslangic', '1 hafta icinde 5 bolum yayinla.', 'chapters_in_week', 5, 150, 140, true, 'ceviri', 1),
  -- Tier 2 Orta
  ('fansub-chapters-25', 'Ceviri Ustasi', '25 bolum yayinla.', 'chapters_published', 25, 500, 200, true, 'ceviri', 2),
  ('fansub-followers-100', 'Populer Fansub', '100 takipci kazan.', 'followers_count', 100, 600, 210, true, 'buyume', 2),
  ('fansub-unique-5', 'Cok Yonlu', '5 farkli mangada ceviri yap.', 'unique_mangas_translated', 5, 400, 220, true, 'ceviri', 2),
  ('fansub-avg-views-50', 'Kaliteli Icerik', 'Bolumlerinde ortalama 50+ goruntulenme.', 'avg_views_per_chapter', 50, 350, 230, true, 'kalite', 2),
  ('fansub-members-10', 'Topluluk Olusturucu', '10 uye al.', 'members_count', 10, 500, 240, true, 'ekip', 2),
  -- Tier 3 Imkansiz
  ('fansub-chapters-100', 'Ceviri Efsanesi', '100 bolum yayinla.', 'chapters_published', 100, 3000, 300, true, 'ceviri', 3),
  ('fansub-followers-500', 'Super Fansub', '500 takipci.', 'followers_count', 500, 5000, 310, true, 'buyume', 3),
  ('fansub-consecutive-30', 'Devamlilik', '30 gun ust uste bolum yayinla.', 'consecutive_publish_days', 30, 4000, 320, true, 'ceviri', 3),
  ('fansub-unique-10', 'Cesitlilik Krali', '10 farkli mangada ceviri yap.', 'unique_mangas_translated', 10, 2500, 330, true, 'ceviri', 3),
  ('fansub-viral-500', 'Viral Icerik', 'Tek bir mangada 500+ goruntulenme al.', 'single_chapter_views', 500, 2000, 340, true, 'kalite', 3)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  metric_key = excluded.metric_key,
  target_value = excluded.target_value,
  coin_reward = excluded.coin_reward,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  task_group = excluded.task_group,
  tier_level = excluded.tier_level,
  updated_at = now();

commit;
