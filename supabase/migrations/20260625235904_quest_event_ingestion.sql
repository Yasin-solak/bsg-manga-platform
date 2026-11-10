-- ============================================
-- MangaZone | Quest Event Ingestion (Phase 1c)
-- * record_quest_event -> daily/weekly counter feed primitive (INTERNAL)
-- * triggers           -> read / rating / comment / post events
-- record_quest_event IS NOT OPENED TO CLIENTS (abuse guard): only trusted definer
-- triggers call it. With no daily/weekly tasks the loop returns empty (no-op);
-- when the Phase 2 seed arrives the same hooks run at once. Achievement/event use lazy
-- metrics so they are unaffected by these events.
--
-- Design note: hot RPCs that change often such as track_manga_read are NOT TOUCHED;
-- events gather from triggers on source tables (resilient to RPC changes).
-- reading_history is a per-manga upsert so the 'chapters_read'
-- event comes from chapter_id TRANSITIONS (reopening the same chapter does not count).
-- Date: 2026-06-25
-- ============================================

begin;

-- ============================================
-- 1) record_quest_event -> INTERNAL primitive
-- Raises only the ACTIVE period counter of daily/weekly tasks.
-- Does not touch a claimed period.
-- ============================================
create or replace function public.record_quest_event(
  p_subject_type text,
  p_subject_id uuid,
  p_metric_key text,
  p_delta integer default 1,
  p_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := lower(trim(coalesce(p_subject_type, '')));
  v_metric text := lower(trim(coalesce(p_metric_key, '')));
  v_delta integer := greatest(coalesce(p_delta, 1), 0);
  v_pkey text;
  v_quest record;
begin
  if p_subject_id is null or v_delta = 0 or v_metric = '' then
    return;
  end if;
  if v_subject not in ('user', 'fansub') then
    return;
  end if;

  for v_quest in
    select id, kind, target_value
    from public.quests
    where audience = v_subject
      and is_active = true
      and kind in ('daily', 'weekly')
      and metric_key = v_metric
  loop
    v_pkey := public.quest_period_key(v_quest.kind, p_at);

    insert into public.quest_progress (
      quest_id, subject_type, subject_id, period_key,
      progress_value, is_completed, completed_at
    )
    values (
      v_quest.id, v_subject, p_subject_id, v_pkey,
      v_delta,
      (v_delta >= v_quest.target_value),
      case when v_delta >= v_quest.target_value then p_at else null end
    )
    on conflict (quest_id, subject_type, subject_id, period_key) do update
      set progress_value = public.quest_progress.progress_value + v_delta,
          is_completed = (public.quest_progress.progress_value + v_delta) >= v_quest.target_value,
          completed_at = case
            when public.quest_progress.completed_at is not null then public.quest_progress.completed_at
            when (public.quest_progress.progress_value + v_delta) >= v_quest.target_value then p_at
            else null
          end,
          updated_at = now()
      where public.quest_progress.claimed_at is null;
  end loop;
end;
$$;

-- Closed to clients: only trusted definer triggers call it.
revoke all on function public.record_quest_event(text, uuid, text, integer, timestamptz) from public;

-- ============================================
-- 2) Read event -> 'chapters_read'
-- reading_history upsert: INSERT (first chapter) or a chapter_id TRANSITION is one read.
-- Reopening the same chapter (chapter_id unchanged) does not count.
-- ============================================
create or replace function public.tg_quest_reading_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.chapter_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' or new.chapter_id is distinct from old.chapter_id then
    perform public.record_quest_event('user', new.user_id, 'chapters_read', 1, coalesce(new.read_at, now()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quest_reading_history on public.reading_history;
create trigger trg_quest_reading_history
  after insert or update on public.reading_history
  for each row execute function public.tg_quest_reading_history();

-- ============================================
-- 3) Rating event -> 'rating_count'
-- manga_ratings PK (manga_id, user_id): AFTER INSERT only on the first rating.
-- ============================================
create or replace function public.tg_quest_manga_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.record_quest_event('user', new.user_id, 'rating_count', 1, now());
  return new;
end;
$$;

drop trigger if exists trg_quest_manga_rating on public.manga_ratings;
create trigger trg_quest_manga_rating
  after insert on public.manga_ratings
  for each row execute function public.tg_quest_manga_rating();

-- ============================================
-- 4) Manga comment event -> 'manga_comment_count' + 'total_comment_count'
-- ============================================
create or replace function public.tg_quest_manga_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_active, true) = true then
    perform public.record_quest_event('user', new.user_id, 'manga_comment_count', 1, now());
    perform public.record_quest_event('user', new.user_id, 'total_comment_count', 1, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quest_manga_comment on public.manga_comments;
create trigger trg_quest_manga_comment
  after insert on public.manga_comments
  for each row execute function public.tg_quest_manga_comment();

-- ============================================
-- 5) Community comment event -> 'community_comment_count' + 'total_comment_count'
-- ============================================
create or replace function public.tg_quest_community_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_active, true) = true then
    perform public.record_quest_event('user', new.author_id, 'community_comment_count', 1, now());
    perform public.record_quest_event('user', new.author_id, 'total_comment_count', 1, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quest_community_comment on public.community_comments;
create trigger trg_quest_community_comment
  after insert on public.community_comments
  for each row execute function public.tg_quest_community_comment();

-- ============================================
-- 6) Topluluk post eventi -> 'community_post_count' (onaylandiginda)
--    INSERT'te dogrudan approved ya da UPDATE'te approved'a gecis.
-- ============================================
create or replace function public.tg_quest_community_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and coalesce(new.is_active, true) = true
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.record_quest_event('user', new.author_id, 'community_post_count', 1, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quest_community_post on public.community_posts;
create trigger trg_quest_community_post
  after insert or update on public.community_posts
  for each row execute function public.tg_quest_community_post();

commit;
