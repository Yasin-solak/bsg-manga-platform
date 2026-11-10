-- MangaZone | Controlled XP reward from task claims
-- The first version rewards only two verified user tasks that are hard to farm
-- . Repeatable actions such as reading, following and commenting give no XP.

begin;

alter table public.quests
  add column if not exists xp_reward integer not null default 0;

alter table public.quests
  drop constraint if exists quests_xp_reward_range;
alter table public.quests
  add constraint quests_xp_reward_range
  check (xp_reward between 0 and 1000);

update public.quests
set xp_reward = case slug
  when 'profile-ready' then 100
  when 'post-3-quality' then 250
  else 0
end
where audience = 'user';

create or replace function app_private.award_claimed_quest_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_quest record;
begin
  if old.claimed_at is not null
     or new.claimed_at is null
     or new.subject_type <> 'user' then
    return new;
  end if;

  select q.slug, q.title, q.xp_reward
  into v_quest
  from public.quests as q
  where q.id = new.quest_id
    and q.audience = 'user'
    and q.slug in ('profile-ready', 'post-3-quality')
    and q.xp_reward > 0
  limit 1;

  if not found then
    return new;
  end if;

  perform app_private.award_user_xp(
    new.subject_id,
    'quest-claim:' || new.id::text,
    'quest_claim',
    new.id::text,
    v_quest.xp_reward,
    'quest.' || v_quest.slug,
    new.claimed_by,
    pg_catalog.jsonb_build_object(
      'quest_id', new.quest_id,
      'quest_slug', v_quest.slug,
      'quest_title', v_quest.title,
      'period_key', new.period_key
    ),
    new.claimed_at,
    true
  );

  return new;
end;
$function$;

drop trigger if exists trg_quest_progress_award_xp on public.quest_progress;
create trigger trg_quest_progress_award_xp
  after update of claimed_at on public.quest_progress
  for each row
  when (old.claimed_at is null and new.claimed_at is not null)
  execute function app_private.award_claimed_quest_xp();

-- Moves previously claimed allowed tasks with the same idempotency key.
-- No bulk level notification is sent to old users.
do $block$
declare
  v_claim record;
begin
  for v_claim in
    select
      qp.id,
      qp.subject_id,
      qp.quest_id,
      qp.period_key,
      qp.claimed_by,
      qp.claimed_at,
      q.slug,
      q.title,
      q.xp_reward
    from public.quest_progress as qp
    join public.quests as q on q.id = qp.quest_id
    where qp.subject_type = 'user'
      and qp.claimed_at is not null
      and q.audience = 'user'
      and q.slug in ('profile-ready', 'post-3-quality')
      and q.xp_reward > 0
    order by qp.claimed_at asc, qp.id asc
  loop
    perform app_private.award_user_xp(
      v_claim.subject_id,
      'quest-claim:' || v_claim.id::text,
      'quest_claim',
      v_claim.id::text,
      v_claim.xp_reward,
      'quest.' || v_claim.slug,
      v_claim.claimed_by,
      pg_catalog.jsonb_build_object(
        'quest_id', v_claim.quest_id,
        'quest_slug', v_claim.slug,
        'quest_title', v_claim.title,
        'period_key', v_claim.period_key,
        'backfilled', true
      ),
      v_claim.claimed_at,
      false
    );
  end loop;
end;
$block$;

revoke all on function app_private.award_claimed_quest_xp()
  from public, anon, authenticated;

comment on column public.quests.xp_reward is
  'Claim tamamlandiginda sunucu kontrollu seviye motoruna aktarilan XP; varsayilan sifirdir.';
comment on function app_private.award_claimed_quest_xp() is
  'Yalnizca izinli kullanici gorevlerinin ilk claim gecisinde idempotent XP olayi uretir.';

notify pgrst, 'reload schema';
commit;
