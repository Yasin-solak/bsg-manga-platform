-- ============================================
-- MangaZone | Rewards and User Task Functions
-- Date: 2026-02-14
-- ============================================

begin;

-- Track manga read + monthly views
-- ============================================
create or replace function public.track_manga_read(
  p_manga_id uuid,
  p_chapter_id uuid default null,
  p_chapter_number numeric default null
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
  v_existing public.reading_history%rowtype;
  v_total_views bigint;
  v_fansub_id uuid;
  v_month_start date;
begin
  if p_manga_id is null then
    raise exception 'Manga id zorunludur.';
  end if;

  v_user_id := public.current_public_user_id();

  if v_user_id is not null then
    select *
    into v_existing
    from public.reading_history
    where user_id = v_user_id
      and manga_id = p_manga_id
    for update;

    if found then
      if v_existing.chapter_id is not distinct from p_chapter_id
         and v_existing.read_at >= v_now - interval '90 seconds' then
        v_should_increment := false;
      end if;

      update public.reading_history
      set chapter_id = coalesce(p_chapter_id, v_existing.chapter_id),
          chapter_number = coalesce(p_chapter_number, v_existing.chapter_number),
          read_at = v_now
      where id = v_existing.id;
    else
      insert into public.reading_history (
        user_id,
        manga_id,
        chapter_id,
        chapter_number,
        read_at
      )
      values (
        v_user_id,
        p_manga_id,
        p_chapter_id,
        p_chapter_number,
        v_now
      );
    end if;
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

grant execute on function public.track_manga_read(uuid, uuid, numeric) to anon, authenticated;

-- ============================================
-- User task helper + claim functions
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

  if v_metric = 'read_manga_count' then
    select count(*)::bigint
    into v_value
    from public.reading_history
    where user_id = v_user_id;
  elsif v_metric = 'manga_follow_count' then
    select count(*)::bigint
    into v_value
    from public.manga_follows
    where user_id = v_user_id;
  elsif v_metric = 'fansub_follow_count' then
    select count(*)::bigint
    into v_value
    from public.fansub_follows
    where user_id = v_user_id;
  elsif v_metric = 'rating_count' then
    select count(*)::bigint
    into v_value
    from public.manga_ratings
    where user_id = v_user_id;
  elsif v_metric = 'manga_comment_count' then
    select count(*)::bigint
    into v_value
    from public.manga_comments
    where user_id = v_user_id
      and coalesce(is_active, true) = true;
  elsif v_metric = 'community_comment_count' then
    select count(*)::bigint
    into v_value
    from public.community_comments
    where author_id = v_user_id
      and coalesce(is_active, true) = true;
  elsif v_metric = 'community_post_count' then
    select count(*)::bigint
    into v_value
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
    )::bigint
    into v_value;
  else
    v_value := 0;
  end if;

  return coalesce(v_value, 0);
end;
$$;

grant execute on function public.get_user_reward_metric_value(text, uuid) to authenticated;

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
  sort_order integer
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
      b.name as badge_name,
      b.image_url as badge_image_url,
      c.id as claim_id,
      c.claimed_at,
      public.get_user_reward_metric_value(t.metric_key, v_user_id) as metric_value
    from public.user_reward_tasks t
    left join public.badges b on b.id = t.badge_id
    left join public.user_reward_task_claims c
      on c.task_id = t.id
     and c.user_id = v_user_id
    where t.is_active = true
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
    (tr.metric_value >= tr.target_value and tr.claim_id is null) as is_claimable,
    tr.coin_reward,
    tr.badge_id,
    tr.badge_name,
    tr.badge_image_url,
    tr.claimed_at,
    tr.sort_order
  from task_rows tr
  order by tr.sort_order asc, tr.title asc;
end;
$$;

grant execute on function public.list_user_reward_tasks() to authenticated;

create or replace function public.claim_user_reward_task(
  p_task_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_task public.user_reward_tasks%rowtype;
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

  if p_task_id is null then
    raise exception 'Gorev secimi zorunludur.';
  end if;

  select *
  into v_task
  from public.user_reward_tasks
  where id = p_task_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Gorev bulunamadi veya aktif degil.';
  end if;

  if exists (
    select 1
    from public.user_reward_task_claims c
    where c.user_id = v_user_id
      and c.task_id = v_task.id
  ) then
    raise exception 'Bu gorevin odulu zaten alinmis.';
  end if;

  v_progress := public.get_user_reward_metric_value(v_task.metric_key, v_user_id);
  if v_progress < v_task.target_value then
    raise exception 'Gorev henuz tamamlanmadi. Ilerleme: % / %', v_progress, v_task.target_value;
  end if;

  if v_task.coin_reward > 0 then
    update public.users
    set stones = coalesce(stones, 0) + v_task.coin_reward
    where id = v_user_id
    returning stones into v_new_balance;
  else
    select coalesce(u.stones, 0)
    into v_new_balance
    from public.users u
    where u.id = v_user_id;
  end if;

  if v_new_balance is null then
    raise exception 'Kullanici kaydi bulunamadi.';
  end if;

  if v_task.badge_id is not null then
    select b.name
    into v_badge_name
    from public.badges b
    where b.id = v_task.badge_id;

    insert into public.user_badges (
      user_id,
      badge_id,
      obtained_at,
      is_displayed,
      display_order
    )
    values (
      v_user_id,
      v_task.badge_id,
      v_claimed_at,
      false,
      0
    )
    on conflict (user_id, badge_id)
    do nothing;

    get diagnostics v_badge_rowcount = row_count;
    v_badge_awarded := v_badge_rowcount > 0;
  end if;

  insert into public.user_reward_task_claims (
    user_id,
    task_id,
    credited_coin,
    badge_id,
    claimed_at
  )
  values (
    v_user_id,
    v_task.id,
    v_task.coin_reward,
    v_task.badge_id,
    v_claimed_at
  )
  returning id into v_claim_id;

  perform public.push_notification(
    v_user_id,
    'system',
    'Gorev odulu alindi',
    format('"%s" gorevinden +%s coin kazandin.', v_task.title, v_task.coin_reward),
    jsonb_build_object(
      'event', 'user_task_claimed',
      'task_id', v_task.id,
      'task_slug', v_task.slug,
      'task_title', v_task.title,
      'coin_reward', v_task.coin_reward,
      'claimed_at', v_claimed_at,
      'route_hint', '/',
      'event_key', format('user-task-claim:%s', v_claim_id::text)
    ),
    null
  );

  if v_badge_awarded and v_task.badge_id is not null then
    perform public.push_notification(
      v_user_id,
      'badge_earned',
      'Yeni rozet kazandin',
      format('"%s" gorevinden "%s" rozetini kazandin.', v_task.title, coalesce(v_badge_name, 'Rozet')),
      jsonb_build_object(
        'event', 'user_task_badge_earned',
        'task_id', v_task.id,
        'task_slug', v_task.slug,
        'badge_id', v_task.badge_id,
        'badge_name', v_badge_name,
        'route_hint', '/',
        'event_key', format('user-task-badge:%s', v_claim_id::text)
      ),
      null
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'task_id', v_task.id,
    'task_slug', v_task.slug,
    'task_title', v_task.title,
    'coin_reward', v_task.coin_reward,
    'new_balance', v_new_balance,
    'badge_id', v_task.badge_id,
    'badge_name', v_badge_name,
    'badge_awarded', v_badge_awarded,
    'claimed_at', v_claimed_at
  );
end;
$$;

grant execute on function public.claim_user_reward_task(uuid) to authenticated;

-- ============================================
-- Fansub monthly preview + reward run functions
-- ============================================
create or replace function public.get_fansub_monthly_reward_preview(
  p_month_start date default null
)
returns table (
  fansub_id uuid,
  fansub_name text,
  total_views bigint,
  rank_position integer,
  rank_coin_reward integer,
  tier_coin_reward integer,
  total_coin_reward integer,
  tier_labels text[]
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_month_start, now()))::date;
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin icin aciktir.';
  end if;

  return query
  with fansub_stats as (
    select
      f.id as fansub_id,
      f.name as fansub_name,
      coalesce(sum(mmv.views), 0)::bigint as total_views
    from public.fansubs f
    left join public.manga_monthly_views mmv
      on mmv.fansub_id = f.id
     and mmv.month_start = v_month_start
    where coalesce(f.is_active, true) = true
    group by f.id, f.name
  ),
  ranked as (
    select
      fs.fansub_id,
      fs.fansub_name,
      fs.total_views,
      row_number() over (
        order by fs.total_views desc, fs.fansub_name asc, fs.fansub_id asc
      )::integer as rank_position
    from fansub_stats fs
    where fs.total_views > 0
  ),
  rank_rewards as (
    select
      r.fansub_id,
      rr.coin_reward::integer as rank_coin_reward
    from ranked r
    left join public.fansub_reward_rank_rules rr
      on rr.rank_position = r.rank_position
     and rr.is_active = true
  ),
  tier_rewards as (
    select
      r.fansub_id,
      coalesce(sum(vt.coin_reward), 0)::integer as tier_coin_reward,
      coalesce(array_agg(vt.label order by vt.min_views asc) filter (where vt.id is not null), '{}'::text[]) as tier_labels
    from ranked r
    left join public.fansub_reward_view_tiers vt
      on vt.is_active = true
     and r.total_views >= vt.min_views
    group by r.fansub_id
  )
  select
    r.fansub_id,
    r.fansub_name,
    r.total_views,
    r.rank_position,
    coalesce(rr.rank_coin_reward, 0)::integer as rank_coin_reward,
    coalesce(tr.tier_coin_reward, 0)::integer as tier_coin_reward,
    (coalesce(rr.rank_coin_reward, 0) + coalesce(tr.tier_coin_reward, 0))::integer as total_coin_reward,
    coalesce(tr.tier_labels, '{}'::text[]) as tier_labels
  from ranked r
  left join rank_rewards rr on rr.fansub_id = r.fansub_id
  left join tier_rewards tr on tr.fansub_id = r.fansub_id
  order by total_coin_reward desc, r.total_views desc, r.fansub_name asc;
end;
$$;

grant execute on function public.get_fansub_monthly_reward_preview(date) to authenticated;

create or replace function public.run_fansub_monthly_rewards(
  p_month_start date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid;
  v_month_start date := date_trunc('month', coalesce(p_month_start, (date_trunc('month', now()) - interval '1 month')::date))::date;
  v_month_label text := to_char(v_month_start, 'YYYY-MM');
  v_run_id uuid;
  v_existing_status text;
  v_total_fansubs integer := 0;
  v_total_coin integer := 0;
  v_row record;
  v_staff_user_id uuid;
begin
  v_actor_user_id := public.current_public_user_id();

  if v_actor_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if not public.is_admin() then
    raise exception 'Bu islem sadece admin tarafindan calistirilabilir.';
  end if;

  select r.id, r.status
  into v_run_id, v_existing_status
  from public.fansub_monthly_reward_runs r
  where r.month_start = v_month_start
  for update;

  if found and v_existing_status = 'completed' then
    select coalesce(r.total_fansubs, 0), coalesce(r.total_coin, 0)
    into v_total_fansubs, v_total_coin
    from public.fansub_monthly_reward_runs r
    where r.id = v_run_id;

    return jsonb_build_object(
      'success', true,
      'already_completed', true,
      'run_id', v_run_id,
      'month_start', v_month_start,
      'total_fansubs', v_total_fansubs,
      'total_coin', v_total_coin
    );
  end if;

  if not found then
    insert into public.fansub_monthly_reward_runs (
      month_start,
      status,
      started_at,
      run_by,
      total_fansubs,
      total_coin,
      summary
    )
    values (
      v_month_start,
      'processing',
      now(),
      v_actor_user_id,
      0,
      0,
      '{}'::jsonb
    )
    returning id into v_run_id;
  else
    update public.fansub_monthly_reward_runs
    set
      status = 'processing',
      started_at = now(),
      completed_at = null,
      run_by = v_actor_user_id,
      total_fansubs = 0,
      total_coin = 0,
      summary = '{}'::jsonb,
      updated_at = now()
    where id = v_run_id;

    delete from public.fansub_monthly_reward_results
    where run_id = v_run_id;
  end if;

  insert into public.fansub_monthly_reward_results (
    run_id,
    month_start,
    fansub_id,
    total_views,
    rank_position,
    rank_coin_reward,
    tier_coin_reward,
    total_coin_reward,
    tier_labels,
    created_at
  )
  select
    v_run_id,
    v_month_start,
    p.fansub_id,
    p.total_views,
    p.rank_position,
    p.rank_coin_reward,
    p.tier_coin_reward,
    p.total_coin_reward,
    p.tier_labels,
    now()
  from public.get_fansub_monthly_reward_preview(v_month_start) p
  where p.total_coin_reward > 0;

  select
    count(*)::integer,
    coalesce(sum(total_coin_reward), 0)::integer
  into v_total_fansubs, v_total_coin
  from public.fansub_monthly_reward_results
  where run_id = v_run_id;

  if v_total_fansubs > 0 then
    update public.fansubs f
    set coin_balance = coalesce(f.coin_balance, 0) + r.total_coin_reward
    from public.fansub_monthly_reward_results r
    where r.run_id = v_run_id
      and r.total_coin_reward > 0
      and r.fansub_id = f.id;

    insert into public.fansub_transactions (
      fansub_id,
      amount,
      type,
      description,
      created_by
    )
    select
      r.fansub_id,
      r.rank_coin_reward,
      'reward_rank',
      format('%s ayi siralama odulu (Sira %s)', v_month_label, r.rank_position::text),
      v_actor_user_id
    from public.fansub_monthly_reward_results r
    where r.run_id = v_run_id
      and r.rank_coin_reward > 0;

    insert into public.fansub_transactions (
      fansub_id,
      amount,
      type,
      description,
      created_by
    )
    select
      r.fansub_id,
      r.tier_coin_reward,
      'reward_view',
      format(
        '%s ayi goruntulenme odulu (%s)',
        v_month_label,
        case
          when cardinality(coalesce(r.tier_labels, '{}'::text[])) = 0 then 'Tier yok'
          else array_to_string(r.tier_labels, ', ')
        end
      ),
      v_actor_user_id
    from public.fansub_monthly_reward_results r
    where r.run_id = v_run_id
      and r.tier_coin_reward > 0;

    for v_row in
      select
        r.fansub_id,
        r.total_views,
        r.rank_position,
        r.rank_coin_reward,
        r.tier_coin_reward,
        r.total_coin_reward,
        r.tier_labels,
        f.name as fansub_name
      from public.fansub_monthly_reward_results r
      join public.fansubs f on f.id = r.fansub_id
      where r.run_id = v_run_id
    loop
      for v_staff_user_id in
        select distinct fm.user_id
        from public.fansub_members fm
        join public.users u on u.id = fm.user_id
        where fm.fansub_id = v_row.fansub_id
          and fm.role in ('admin', 'moderator')
          and u.is_active = true
      loop
        perform public.push_notification(
          v_staff_user_id,
          'system',
          'Aylik fansub odulu yatti',
          format(
            '%s icin %s donemine +%s coin odulu tanimlandi. Goruntulenme: %s, Sira: %s.',
            v_row.fansub_name,
            v_month_label,
            v_row.total_coin_reward,
            v_row.total_views,
            coalesce(v_row.rank_position::text, '-')
          ),
          jsonb_build_object(
            'event', 'fansub_monthly_reward',
            'fansub_id', v_row.fansub_id,
            'month_start', v_month_start,
            'total_views', v_row.total_views,
            'rank_position', v_row.rank_position,
            'rank_coin_reward', v_row.rank_coin_reward,
            'tier_coin_reward', v_row.tier_coin_reward,
            'total_coin_reward', v_row.total_coin_reward,
            'route_hint', '/fansublar',
            'event_key', format(
              'fansub-monthly-reward:%s:%s:%s',
              v_run_id::text,
              v_row.fansub_id::text,
              v_staff_user_id::text
            )
          ),
          null
        );
      end loop;
    end loop;
  end if;

  update public.fansub_monthly_reward_runs
  set
    status = 'completed',
    completed_at = now(),
    total_fansubs = v_total_fansubs,
    total_coin = v_total_coin,
    summary = jsonb_build_object(
      'month_start', v_month_start,
      'month_label', v_month_label,
      'total_fansubs', v_total_fansubs,
      'total_coin', v_total_coin
    ),
    updated_at = now()
  where id = v_run_id;

  return jsonb_build_object(
    'success', true,
    'already_completed', false,
    'run_id', v_run_id,
    'month_start', v_month_start,
    'month_label', v_month_label,
    'total_fansubs', v_total_fansubs,
    'total_coin', v_total_coin
  );
exception
  when others then
    if v_run_id is not null then
      update public.fansub_monthly_reward_runs
      set
        status = 'failed',
        summary = jsonb_build_object(
          'month_start', v_month_start,
          'failed_at', now(),
          'error', sqlerrm
        ),
        updated_at = now()
      where id = v_run_id;
    end if;
    raise;
end;
$$;

grant execute on function public.run_fansub_monthly_rewards(date) to authenticated;

commit;
