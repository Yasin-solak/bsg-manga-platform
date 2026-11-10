-- Fansub tasks v2: weekly tasks and studio / community chains.
--
-- Weekly fansub tasks (metric_key 'week_*') look at real data, not an event counter
-- : progress computes on each read from this week's (Europe/Istanbul, ISO week)
-- records. So the counter cannot inflate by deleting/adding chapters or opening/closing tasks
-- ; the reward is claimed once a week (period_key = IYYY-WIW).
-- list_quests / claim_quest change only for this branch, the rest is the same.

begin;

create or replace function public.get_fansub_reward_metric_value(p_metric_key text, p_fansub_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_metric text := lower(trim(coalesce(p_metric_key, '')));
  v_value bigint := 0;
  -- Same week as quest_period_key('weekly'): Monday 00:00 Istanbul time.
  v_week_start timestamptz := date_trunc('week', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
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

  -- ---- Ceviri studyosu ----
  elsif v_metric = 'studio_pages_done' then
    select count(*)::bigint into v_value
    from public.translation_page_tasks t
    join public.translation_projects p on p.id = t.project_id
    where p.fansub_id = p_fansub_id
      and t.status = 'tamam';

  elsif v_metric = 'studio_chapters_published' then
    select count(*)::bigint into v_value
    from public.translation_projects p
    where p.fansub_id = p_fansub_id
      and p.stage = 'published';

  -- ---- Topluluk / ekip duzeni ----
  elsif v_metric = 'notices_published' then
    select count(*)::bigint into v_value
    from public.fansub_pinned_notices n
    where n.fansub_id = p_fansub_id;

  elsif v_metric = 'roles_defined' then
    select count(*)::bigint into v_value
    from public.fansub_roles r
    where r.fansub_id = p_fansub_id;

  -- ---- Weekly (this ISO week) ----
  elsif v_metric = 'week_chapters_published' then
    select count(*)::bigint into v_value
    from public.chapters c
    join public.mangas m on m.id = c.manga_id
    where m.fansub_id = p_fansub_id
      and c.is_active = true
      and c.created_at >= v_week_start;

  elsif v_metric = 'week_studio_pages_done' then
    select count(*)::bigint into v_value
    from public.translation_page_tasks t
    join public.translation_projects p on p.id = t.project_id
    where p.fansub_id = p_fansub_id
      and t.status = 'tamam'
      and t.completed_at >= v_week_start;

  elsif v_metric = 'week_active_contributors' then
    select count(distinct t.assignee_id)::bigint into v_value
    from public.translation_page_tasks t
    join public.translation_projects p on p.id = t.project_id
    where p.fansub_id = p_fansub_id
      and t.status = 'tamam'
      and t.assignee_id is not null
      and t.completed_at >= v_week_start;

  elsif v_metric = 'week_new_followers' then
    select count(*)::bigint into v_value
    from public.fansub_follows f
    where f.fansub_id = p_fansub_id
      and f.created_at >= v_week_start;

  elsif v_metric = 'week_notices_published' then
    select count(*)::bigint into v_value
    from public.fansub_pinned_notices n
    where n.fansub_id = p_fansub_id
      and n.created_at >= v_week_start;

  else
    v_value := 0;
  end if;

  return coalesce(v_value, 0);
end;
$$;

-- ===== list_quests (kaynak: 255) =====
create or replace function public.list_quests(
  p_audience text,
  p_subject_id uuid default null
)
returns table (
  quest_id uuid,
  slug text,
  title text,
  description text,
  audience text,
  kind text,
  metric_key text,
  target_value integer,
  progress_value bigint,
  is_completed boolean,
  is_claimed boolean,
  is_claimable boolean,
  is_locked boolean,
  reward_kind text,
  coin_reward integer,
  badge_id uuid,
  badge_name text,
  badge_image_url text,
  reward_item_id uuid,
  reward_item_name text,
  reward_item_type text,
  reward_item_image text,
  boost_credit integer,
  gate_metric_key text,
  gate_min_value integer,
  gate_progress_value bigint,
  gate_met boolean,
  task_group text,
  tier_level integer,
  unlock_quest_id uuid,
  unlock_quest_title text,
  period_key text,
  claimed_at timestamptz,
  sort_order integer,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_audience text := lower(trim(coalesce(p_audience, '')));
  v_user_id uuid;
  v_subject_id uuid;
  v_account_age_days integer := 0;
begin
  if v_audience not in ('user', 'fansub') then
    raise exception 'Gecersiz gorev hedefi.';
  end if;

  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if v_audience = 'user' then
    if not public.is_feature_enabled('rewards.user_tasks', false) then
      raise exception 'Kullanici gorev sistemi su anda gecici olarak kapali.';
    end if;
    v_subject_id := v_user_id;
    select greatest(0, (extract(epoch from (now() - u.created_at)) / 86400)::int)
      into v_account_age_days
    from public.users u where u.id = v_subject_id;
  else
    if not public.is_feature_enabled('rewards.fansub_tasks', false) then
      raise exception 'Fansub gorev sistemi su anda gecici olarak kapali.';
    end if;
    if p_subject_id is null then
      raise exception 'Fansub ID zorunludur.';
    end if;
    if not (public.is_admin() or public.is_fansub_staff(p_subject_id)) then
      raise exception 'Bu fansub gorevlerini goruntuleme yetkiniz yok.';
    end if;
    v_subject_id := p_subject_id;
    select greatest(0, (extract(epoch from (now() - f.created_at)) / 86400)::int)
      into v_account_age_days
    from public.fansubs f where f.id = v_subject_id;
  end if;

  return query
  with q as (
    select t.*, public.quest_period_key(t.kind, now()) as pkey
    from public.quests t
    where t.audience = v_audience
      and t.is_active = true
      and (
        t.kind <> 'event'
        or (
          (t.starts_at is null or t.starts_at <= now())
          and (t.ends_at is null or t.ends_at >= now())
        )
      )
  ),
  prog as (
    select
      q.id as quest_id,
      q.pkey,
      case
        -- Fansub weekly tasks (metric week_*) compute from real data; no event counter.
        when q.kind in ('daily', 'weekly', 'event')
          and not (v_audience = 'fansub' and q.metric_key like 'week\_%') then coalesce(qp.progress_value, 0)
        when v_audience = 'user' then public.get_user_reward_metric_value(q.metric_key, v_subject_id)
        else public.get_fansub_reward_metric_value(q.metric_key, v_subject_id)
      end as progress_value,
      qp.claimed_at,
      (qp.claimed_at is not null) as is_claimed,
      case
        when q.gate_metric_key is null then null
        when v_audience = 'user' then public.get_user_reward_metric_value(q.gate_metric_key, v_subject_id)
        else public.get_fansub_reward_metric_value(q.gate_metric_key, v_subject_id)
      end as gate_progress_value
    from q
    left join public.quest_progress qp
      on qp.quest_id = q.id
     and qp.subject_type = v_audience
     and qp.subject_id = v_subject_id
     and qp.period_key = q.pkey
  ),
  unlocks as (
    select
      q.id as quest_id,
      uq.title as unlock_title,
      case
        when q.unlock_requires_quest_id is null then false
        when exists (
          select 1 from public.quest_progress uqp
          where uqp.quest_id = q.unlock_requires_quest_id
            and uqp.subject_type = v_audience
            and uqp.subject_id = v_subject_id
            and uqp.claimed_at is not null
        ) then false
        else true
      end as is_locked
    from q
    left join public.quests uq on uq.id = q.unlock_requires_quest_id
  )
  select
    q.id,
    q.slug,
    q.title,
    coalesce(q.description, ''),
    q.audience,
    q.kind,
    q.metric_key,
    q.target_value,
    p.progress_value,
    (p.progress_value >= q.target_value) as is_completed,
    p.is_claimed,
    (
      p.progress_value >= q.target_value
      and p.is_claimed = false
      and u.is_locked = false
      and (q.gate_metric_key is null or coalesce(p.gate_progress_value, 0) >= coalesce(q.gate_min_value, 0))
      and v_account_age_days >= q.min_account_age_days
    ) as is_claimable,
    u.is_locked,
    q.reward_kind,
    q.coin_reward,
    q.badge_id,
    b.name,
    b.image_url,
    q.reward_item_id,
    s.name,
    s.type,
    coalesce(s.custom_asset_url, s.image_key),
    q.boost_credit,
    q.gate_metric_key,
    q.gate_min_value,
    p.gate_progress_value,
    (
      q.gate_metric_key is null
      or (
        coalesce(p.gate_progress_value, 0) >= coalesce(q.gate_min_value, 0)
        and v_account_age_days >= q.min_account_age_days
      )
    ) as gate_met,
    q.task_group,
    q.tier_level,
    q.unlock_requires_quest_id,
    u.unlock_title,
    p.pkey,
    p.claimed_at,
    q.sort_order,
    q.starts_at,
    q.ends_at
  from q
  join prog p on p.quest_id = q.id
  join unlocks u on u.quest_id = q.id
  left join public.badges b on b.id = q.badge_id
  left join public.store_items s on s.id = q.reward_item_id
  order by q.kind, q.task_group, q.tier_level, q.sort_order, q.title;
end;
$$;

grant execute on function public.list_quests(text, uuid) to authenticated;

-- ===== claim_quest (kaynak: 255) =====
create or replace function public.claim_quest(
  p_quest_id uuid,
  p_subject_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quest public.quests%rowtype;
  v_item public.store_items%rowtype;
  v_user_id uuid;
  v_subject_id uuid;
  v_pkey text;
  v_progress bigint := 0;
  v_gate_progress bigint := 0;
  v_account_age_days integer := 0;
  v_new_balance integer;
  v_badge_name text;
  v_badge_awarded boolean := false;
  v_badge_rowcount integer := 0;
  v_item_granted boolean := false;
  v_claimed_at timestamptz := now();
  v_progress_id uuid;
  v_existing_claimed timestamptz;
begin
  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;
  if p_quest_id is null then
    raise exception 'Gorev secimi zorunludur.';
  end if;

  select * into v_quest from public.quests where id = p_quest_id and is_active = true for update;
  if not found then
    raise exception 'Gorev bulunamadi veya aktif degil.';
  end if;

  if v_quest.audience = 'user' then
    if not public.is_feature_enabled('rewards.user_tasks', false) then
      raise exception 'Kullanici gorev sistemi su anda gecici olarak kapali.';
    end if;
    v_subject_id := v_user_id;
    select greatest(0, (extract(epoch from (now() - u.created_at)) / 86400)::int)
      into v_account_age_days from public.users u where u.id = v_subject_id;
  else
    if not public.is_feature_enabled('rewards.fansub_tasks', false) then
      raise exception 'Fansub gorev sistemi su anda gecici olarak kapali.';
    end if;
    if p_subject_id is null then
      raise exception 'Fansub ID zorunludur.';
    end if;
    if not public.is_fansub_staff(p_subject_id) then
      raise exception 'Bu islemi sadece fansub yoneticileri yapabilir.';
    end if;
    v_subject_id := p_subject_id;
    select greatest(0, (extract(epoch from (now() - f.created_at)) / 86400)::int)
      into v_account_age_days from public.fansubs f where f.id = v_subject_id;
  end if;

  -- event penceresi
  if v_quest.kind = 'event' then
    if (v_quest.starts_at is not null and v_quest.starts_at > now())
       or (v_quest.ends_at is not null and v_quest.ends_at < now()) then
      raise exception 'Bu etkinlik gorevi su anda aktif degil.';
    end if;
  end if;

  v_pkey := public.quest_period_key(v_quest.kind, now());

  -- period bazli claim kilidi
  select id, claimed_at into v_progress_id, v_existing_claimed
  from public.quest_progress
  where quest_id = v_quest.id
    and subject_type = v_quest.audience
    and subject_id = v_subject_id
    and period_key = v_pkey
  for update;

  if v_existing_claimed is not null then
    raise exception 'Bu gorevin odulu zaten alinmis.';
  end if;

  -- ilerleme
  if v_quest.kind in ('daily', 'weekly', 'event')
     and not (v_quest.audience = 'fansub' and v_quest.metric_key like 'week\_%') then
    v_progress := coalesce((
      select progress_value from public.quest_progress
      where quest_id = v_quest.id and subject_type = v_quest.audience
        and subject_id = v_subject_id and period_key = v_pkey
    ), 0);
  elsif v_quest.audience = 'user' then
    v_progress := public.get_user_reward_metric_value(v_quest.metric_key, v_subject_id);
  else
    v_progress := public.get_fansub_reward_metric_value(v_quest.metric_key, v_subject_id);
  end if;

  if v_progress < v_quest.target_value then
    raise exception 'Gorev henuz tamamlanmadi. Ilerleme: % / %', v_progress, v_quest.target_value;
  end if;

  -- unlock kilidi
  if v_quest.unlock_requires_quest_id is not null then
    if not exists (
      select 1 from public.quest_progress uqp
      where uqp.quest_id = v_quest.unlock_requires_quest_id
        and uqp.subject_type = v_quest.audience
        and uqp.subject_id = v_subject_id
        and uqp.claimed_at is not null
    ) then
      raise exception 'Onceki gorev tamamlanmadan bu gorev acilmaz.';
    end if;
  end if;

  -- kozmetik / zaman kapisi ("baya baya zaman harcamis" sarti)
  if v_quest.gate_metric_key is not null then
    if v_quest.audience = 'user' then
      v_gate_progress := public.get_user_reward_metric_value(v_quest.gate_metric_key, v_subject_id);
    else
      v_gate_progress := public.get_fansub_reward_metric_value(v_quest.gate_metric_key, v_subject_id);
    end if;
    if v_gate_progress < coalesce(v_quest.gate_min_value, 0) then
      raise exception 'Bu odul icin yeterli deneyim yok (% / %).', v_gate_progress, coalesce(v_quest.gate_min_value, 0);
    end if;
  end if;
  if v_account_age_days < v_quest.min_account_age_days then
    raise exception 'Bu odul icin hesap yasi yetersiz (% / % gun).', v_account_age_days, v_quest.min_account_age_days;
  end if;

  -- REWARDS (additive) ----------------------------------------------------
  -- coin
  if coalesce(v_quest.coin_reward, 0) > 0 then
    if v_quest.audience = 'user' then
      update public.users set stones = coalesce(stones, 0) + v_quest.coin_reward
        where id = v_subject_id returning stones into v_new_balance;
    else
      update public.fansubs set coin_balance = coalesce(coin_balance, 0) + v_quest.coin_reward
        where id = v_subject_id returning coin_balance into v_new_balance;
      insert into public.fansub_transactions (fansub_id, amount, type, description, created_by)
        values (v_subject_id, v_quest.coin_reward, 'reward_task', format('Gorev odulu: "%s"', v_quest.title), v_user_id);
    end if;
  else
    if v_quest.audience = 'user' then
      select coalesce(stones, 0) into v_new_balance from public.users where id = v_subject_id;
    else
      select coalesce(coin_balance, 0) into v_new_balance from public.fansubs where id = v_subject_id;
    end if;
  end if;

  -- badge
  if v_quest.badge_id is not null then
    select name into v_badge_name from public.badges where id = v_quest.badge_id;
    if v_quest.audience = 'user' then
      insert into public.user_badges (user_id, badge_id, obtained_at, is_displayed, display_order)
        values (v_subject_id, v_quest.badge_id, v_claimed_at, false, 0)
        on conflict (user_id, badge_id) do nothing;
    else
      insert into public.fansub_badges (fansub_id, badge_id, obtained_at, is_displayed, display_order)
        values (v_subject_id, v_quest.badge_id, v_claimed_at, false, 0)
        on conflict (fansub_id, badge_id) do nothing;
    end if;
    get diagnostics v_badge_rowcount = row_count;
    v_badge_awarded := v_badge_rowcount > 0;
  end if;

  -- cosmetic (store_item) -> user inventory only
  if v_quest.reward_item_id is not null and v_quest.audience = 'user' then
    select * into v_item from public.store_items where id = v_quest.reward_item_id and is_active = true;
    if found then
      insert into public.user_inventory_items (
        user_id, store_item_id, item_type, item_identifier, acquired_via, source_kind, source_ref, is_active, metadata
      ) values (
        v_subject_id, v_item.id, v_item.type, v_item.identifier, 'quest_reward', 'quest', v_quest.id::text, true,
        jsonb_build_object('quest_slug', v_quest.slug, 'quest_title', v_quest.title)
      );
      v_item_granted := true;
    end if;
  end if;

  -- CLAIM SNAPSHOT --------------------------------------------------------
  if v_progress_id is null then
    insert into public.quest_progress (
      quest_id, subject_type, subject_id, period_key, progress_value, is_completed, completed_at,
      claimed_at, claimed_by, credited_coin
    ) values (
      v_quest.id, v_quest.audience, v_subject_id, v_pkey, v_progress, true, v_claimed_at,
      v_claimed_at, v_user_id, coalesce(v_quest.coin_reward, 0)
    );
  else
    update public.quest_progress set
      progress_value = greatest(progress_value, v_progress),
      is_completed = true,
      completed_at = coalesce(completed_at, v_claimed_at),
      claimed_at = v_claimed_at,
      claimed_by = v_user_id,
      credited_coin = coalesce(v_quest.coin_reward, 0)
    where id = v_progress_id;
  end if;

  -- NOTIFICATION (user) --------------------------------------------------
  if v_quest.audience = 'user' then
    perform public.push_notification(
      v_subject_id,
      'system',
      'Gorev odulu alindi',
      format('"%s" gorevini tamamladin.', v_quest.title),
      jsonb_build_object(
        'event', 'quest_claimed',
        'quest_id', v_quest.id,
        'quest_slug', v_quest.slug,
        'quest_title', v_quest.title,
        'kind', v_quest.kind,
        'coin_reward', coalesce(v_quest.coin_reward, 0),
        'item_granted', v_item_granted,
        'route_hint', '/',
        'event_key', format('quest-claim:%s:%s:%s', v_quest.id::text, v_subject_id::text, v_pkey)
      ),
      null
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'quest_id', v_quest.id,
    'quest_slug', v_quest.slug,
    'quest_title', v_quest.title,
    'kind', v_quest.kind,
    'audience', v_quest.audience,
    'period_key', v_pkey,
    'coin_reward', coalesce(v_quest.coin_reward, 0),
    'new_balance', coalesce(v_new_balance, 0),
    'badge_id', v_quest.badge_id,
    'badge_name', v_badge_name,
    'badge_awarded', v_badge_awarded,
    'reward_item_id', v_quest.reward_item_id,
    'item_granted', v_item_granted,
    'claimed_at', v_claimed_at
  );
end;
$$;

grant execute on function public.claim_quest(uuid, uuid) to authenticated;

-- ===== Task seeds =====
-- Weekly: resets each Monday, reward once a week.
insert into public.quests (slug, title, description, audience, kind, metric_key, target_value, reward_kind, coin_reward, task_group, tier_level, sort_order, is_active)
values
  ('fansub-weekly-chapters-2', 'Haftanın bölümleri', 'Bu hafta 2 bölüm yayınla.', 'fansub', 'weekly', 'week_chapters_published', 2, 'coin', 80, 'haftalik', 1, 10, true),
  ('fansub-weekly-studio-pages-20', 'Stüdyo mesaisi', 'Çeviri Stüdyosu''nda bu hafta 20 sayfa görevi bitirin.', 'fansub', 'weekly', 'week_studio_pages_done', 20, 'coin', 100, 'haftalik', 1, 20, true),
  ('fansub-weekly-contributors-3', 'Ekip işi', 'Bu hafta en az 3 farklı üye stüdyoda görev bitirsin.', 'fansub', 'weekly', 'week_active_contributors', 3, 'coin', 120, 'haftalik', 1, 30, true),
  ('fansub-weekly-followers-5', 'Yeni yüzler', 'Bu hafta 5 yeni takipçi kazan.', 'fansub', 'weekly', 'week_new_followers', 5, 'coin', 60, 'haftalik', 1, 40, true),
  ('fansub-weekly-notice-1', 'Haber ver', 'Bu hafta profiline bir duyuru ekle.', 'fansub', 'weekly', 'week_notices_published', 1, 'coin', 30, 'haftalik', 1, 50, true)
on conflict (slug) do nothing;

-- Durable chains: studio and community.
insert into public.quests (slug, title, description, audience, kind, metric_key, target_value, reward_kind, coin_reward, task_group, tier_level, sort_order, is_active)
values
  ('fansub-studio-chapter-1', 'İlk stüdyo bölümü', 'Çeviri Stüdyosu''nda hazırlanan ilk bölümü yayınla.', 'fansub', 'achievement', 'studio_chapters_published', 1, 'coin', 200, 'studyo', 1, 10, true),
  ('fansub-studio-pages-25', 'Isınma turu', 'Stüdyoda 25 sayfa görevi bitirin.', 'fansub', 'achievement', 'studio_pages_done', 25, 'coin', 150, 'studyo', 1, 20, true),
  ('fansub-studio-pages-250', 'Atölye', 'Stüdyoda 250 sayfa görevi bitirin.', 'fansub', 'achievement', 'studio_pages_done', 250, 'coin', 800, 'studyo', 2, 30, true),
  ('fansub-studio-chapters-10', 'Seri üretim', 'Stüdyoda hazırlanan 10 bölüm yayınla.', 'fansub', 'achievement', 'studio_chapters_published', 10, 'coin', 1000, 'studyo', 2, 40, true),
  ('fansub-studio-pages-1000', 'Fabrika', 'Stüdyoda 1.000 sayfa görevi bitirin.', 'fansub', 'achievement', 'studio_pages_done', 1000, 'coin', 3000, 'studyo', 3, 50, true),
  ('fansub-notices-1', 'İlk duyuru', 'Profiline ilk duyuruyu ekle.', 'fansub', 'achievement', 'notices_published', 1, 'coin', 50, 'topluluk', 1, 10, true),
  ('fansub-roles-2', 'Ekip düzeni', 'Roller ve izinler sekmesinde en az 2 rol tanımla.', 'fansub', 'achievement', 'roles_defined', 2, 'coin', 80, 'ekip', 1, 5, true),
  ('fansub-notices-10', 'Haber merkezi', 'Toplam 10 duyuru yayınla.', 'fansub', 'achievement', 'notices_published', 10, 'coin', 300, 'topluluk', 2, 20, true)
on conflict (slug) do nothing;

-- Chain locks: the next tier opens when the previous reward is claimed.
update public.quests q set unlock_requires_quest_id = prev.id
from (values
  ('fansub-studio-pages-250', 'fansub-studio-pages-25'),
  ('fansub-studio-pages-1000', 'fansub-studio-pages-250'),
  ('fansub-studio-chapters-10', 'fansub-studio-chapter-1'),
  ('fansub-notices-10', 'fansub-notices-1')
) as link(slug, prev_slug)
join public.quests prev on prev.slug = link.prev_slug
where q.slug = link.slug and q.unlock_requires_quest_id is null;

-- Old fansub task titles appeared without accents in the UI.
update public.quests q set title = fix.title, description = coalesce(fix.description, q.description), updated_at = now()
from (values
  ('fansub-followers-10', 'İlk takipçiler', 'Fansubun 10 takipçiye ulaşsın.'),
  ('fansub-followers-100', 'Popüler fansub', 'Fansubun 100 takipçiye ulaşsın.'),
  ('fansub-followers-500', 'Süper fansub', 'Fansubun 500 takipçiye ulaşsın.'),
  ('fansub-chapters-3', 'İlk çeviri', 'Toplam 3 bölüm yayınla.'),
  ('fansub-week-5', 'Düzenli başlangıç', 'Son 7 günde 5 bölüm yayınla.'),
  ('fansub-manga-1', 'Yeni seri', 'Bölümü olan ilk serini aç.'),
  ('fansub-unique-5', 'Çok yönlü', '5 farklı seriye bölüm çevir.'),
  ('fansub-chapters-25', 'Çeviri ustası', 'Toplam 25 bölüm yayınla.'),
  ('fansub-consecutive-30', 'Devamlılık', '30 gün üst üste bölüm yayınla.'),
  ('fansub-unique-10', 'Çeşitlilik kralı', '10 farklı seriye bölüm çevir.'),
  ('fansub-chapters-100', 'Çeviri efsanesi', 'Toplam 100 bölüm yayınla.'),
  ('fansub-members-3', 'Ekip kurucu', 'Ekibin 3 üyeye ulaşsın.'),
  ('fansub-members-10', 'Topluluk oluşturucu', 'Ekibin 10 üyeye ulaşsın.'),
  ('fansub-avg-views-50', 'Kaliteli içerik', 'Bölüm başına ortalama 50 okunma.'),
  ('fansub-viral-500', 'Viral içerik', 'Bir serin 500 okunmaya ulaşsın.')
) as fix(slug, title, description)
where q.slug = fix.slug and q.audience = 'fansub';

commit;
