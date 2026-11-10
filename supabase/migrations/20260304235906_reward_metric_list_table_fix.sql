-- ============================================
-- MangaZone | Reward Metric List Table Fix
-- List metric hotfix for the `list_user_reward_tasks` RPC
-- Date: 2026-03-04
-- ============================================

begin;

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

  if v_metric = 'read_manga_count' then
    select count(*)::bigint into v_value
    from public.reading_history
    where user_id = v_user_id;

  elsif v_metric = 'manga_follow_count' then
    select count(*)::bigint into v_value
    from public.manga_follows
    where user_id = v_user_id;

  elsif v_metric = 'fansub_follow_count' then
    select count(*)::bigint into v_value
    from public.fansub_follows
    where user_id = v_user_id;

  elsif v_metric = 'rating_count' then
    select count(*)::bigint into v_value
    from public.manga_ratings
    where user_id = v_user_id;

  elsif v_metric = 'manga_comment_count' then
    select count(*)::bigint into v_value
    from public.manga_comments
    where user_id = v_user_id
      and coalesce(is_active, true) = true;

  elsif v_metric = 'community_comment_count' then
    select count(*)::bigint into v_value
    from public.community_comments
    where author_id = v_user_id
      and coalesce(is_active, true) = true;

  elsif v_metric = 'community_post_count' then
    select count(*)::bigint into v_value
    from public.community_posts
    where author_id = v_user_id
      and coalesce(is_active, true) = true
      and status = 'approved';

  elsif v_metric = 'total_comment_count' then
    select (
      coalesce((
        select count(*)::bigint
        from public.manga_comments
        where user_id = v_user_id
          and coalesce(is_active, true) = true
      ), 0)
      +
      coalesce((
        select count(*)::bigint
        from public.community_comments
        where author_id = v_user_id
          and coalesce(is_active, true) = true
      ), 0)
    )::bigint into v_value;

  elsif v_metric = 'unique_mangas_read' then
    select count(distinct manga_id)::bigint into v_value
    from public.reading_history
    where user_id = v_user_id;

  elsif v_metric = 'qualified_comments' then
    select count(*)::bigint into v_value
    from public.manga_comments
    where user_id = v_user_id
      and coalesce(is_active, true) = true
      and length(trim(coalesce(content, ''))) >= 15;

  elsif v_metric = 'qualified_unique_comments' then
    select count(distinct manga_id)::bigint into v_value
    from public.manga_comments
    where user_id = v_user_id
      and coalesce(is_active, true) = true
      and length(trim(coalesce(content, ''))) >= 15;

  elsif v_metric = 'lists_with_items' then
    select count(distinct l.id)::bigint into v_value
    from public.user_manga_lists l
    join public.user_manga_list_items li on li.list_id = l.id
    where l.owner_id = v_user_id;

  elsif v_metric = 'qualified_ratings' then
    select count(*)::bigint into v_value
    from public.manga_ratings r
    where r.user_id = v_user_id
      and exists (
        select 1
        from public.reading_history rh
        where rh.user_id = v_user_id
          and rh.manga_id = r.manga_id
      );

  elsif v_metric = 'profile_completed' then
    select case
      when (
        u.avatar_url is not null
        and length(trim(coalesce(u.avatar_url, ''))) > 0
        and u.bio is not null
        and length(trim(coalesce(u.bio, ''))) > 0
      ) then 1
      else 0
    end
    into v_value
    from public.users u
    where u.id = v_user_id;

  elsif v_metric = 'chapters_read' then
    select count(*)::bigint into v_value
    from public.reading_history
    where user_id = v_user_id;

  elsif v_metric = 'favorites_count' then
    select count(*)::bigint into v_value
    from public.manga_follows
    where user_id = v_user_id;

  elsif v_metric = 'genres_explored' then
    select count(distinct g)::bigint into v_value
    from public.reading_history rh
    join public.mangas m on m.id = rh.manga_id
    cross join lateral unnest(coalesce(m.genres, '{}'::text[])) as g
    where rh.user_id = v_user_id
      and trim(g) <> '';

  elsif v_metric = 'consecutive_days' then
    with daily_activity as (
      select distinct date_trunc('day', read_at)::date as active_day
      from public.reading_history
      where user_id = v_user_id
      order by active_day desc
    ),
    streaks as (
      select
        active_day,
        active_day - (row_number() over (order by active_day))::integer as streak_group
      from daily_activity
    )
    select coalesce(max(streak_count), 0)::bigint into v_value
    from (
      select count(*) as streak_count
      from streaks
      group by streak_group
    ) s;

  elsif v_metric = 'qualified_posts' then
    select count(*)::bigint into v_value
    from public.community_posts
    where author_id = v_user_id
      and coalesce(is_active, true) = true
      and status = 'approved'
      and length(trim(coalesce(body, ''))) >= 50;

  elsif v_metric = 'upvotes_received' then
    select (
      coalesce((
        select count(*)::bigint
        from public.manga_comment_reactions mcr
        join public.manga_comments mc on mc.id = mcr.comment_id
        where mc.user_id = v_user_id
          and mcr.user_id <> v_user_id
          and mcr.reaction = 'like'
      ), 0)
      +
      coalesce((
        select count(*)::bigint
        from public.community_comment_reactions ccr
        join public.community_comments cc on cc.id = ccr.comment_id
        where cc.author_id = v_user_id
          and ccr.user_id <> v_user_id
          and ccr.reaction = 'like'
      ), 0)
    )::bigint into v_value;

  elsif v_metric = 'chapters_in_single_day' then
    select coalesce(max(day_count), 0)::bigint into v_value
    from (
      select count(*) as day_count
      from public.reading_history
      where user_id = v_user_id
      group by date_trunc('day', read_at)::date
    ) daily;

  elsif v_metric = 'qualified_lists' then
    select count(*)::bigint into v_value
    from (
      select l.id
      from public.user_manga_lists l
      join public.user_manga_list_items li on li.list_id = l.id
      where l.owner_id = v_user_id
      group by l.id
      having count(li.id) >= 10
    ) qualified_lists;

  elsif v_metric = 'night_chapters_read' then
    select count(*)::bigint into v_value
    from public.reading_history
    where user_id = v_user_id
      and extract(hour from read_at) between 0 and 4;

  elsif v_metric = 'unique_mangas_completed' then
    select count(distinct rh.manga_id)::bigint into v_value
    from public.reading_history rh
    join public.mangas m on m.id = rh.manga_id
    where rh.user_id = v_user_id
      and m.status = 'completed';

  elsif v_metric = 'community_leader_score' then
    select (
      coalesce((
        select count(*)::bigint
        from public.community_posts
        where author_id = v_user_id
          and coalesce(is_active, true) = true
          and status = 'approved'
          and length(trim(coalesce(body, ''))) >= 50
      ), 0)
      +
      coalesce((
        select count(*)::bigint
        from public.community_comment_reactions ccr
        join public.community_comments cc on cc.id = ccr.comment_id
        where cc.author_id = v_user_id
          and ccr.user_id <> v_user_id
          and ccr.reaction = 'like'
      ), 0)
    )::bigint into v_value;

  elsif v_metric = 'weekly_trending_read' then
    v_value := 0;

  elsif v_metric = 'first_day_actions' then
    v_value := 0;

  else
    v_value := 0;
  end if;

  return coalesce(v_value, 0);
end;
$$;

commit;
