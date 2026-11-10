-- Extend the community detail reaction set:
-- - keep current positive reactions
-- - add 😡 and 👎 as negative signals
-- - lower the poll option upper limit to 4

do $$
declare
  v_poll_id uuid;
begin
  -- Old polls may hold options 5 and 6. For a safe move to the new limit
  -- we first clean these options and their votes.
  for v_poll_id in
    select distinct poll_id
    from public.community_post_poll_options
    where position > 4
  loop
    delete from public.community_post_poll_options
    where poll_id = v_poll_id
      and position > 4;

    with ranked_options as (
      select
        id,
        row_number() over (partition by poll_id order by position asc, created_at asc, id asc) as next_position
      from public.community_post_poll_options
      where poll_id = v_poll_id
    )
    update public.community_post_poll_options cppo
    set position = ranked_options.next_position
    from ranked_options
    where cppo.id = ranked_options.id
      and cppo.position <> ranked_options.next_position;

    perform public.sync_community_post_poll_counts(v_poll_id);
  end loop;
end;
$$;

alter table public.community_post_poll_options
  drop constraint if exists community_post_poll_options_position_check;

alter table public.community_post_poll_options
  add constraint community_post_poll_options_position_check
  check (position between 1 and 4);

alter table public.community_post_reactions
  drop constraint if exists community_post_reactions_emoji_check;

alter table public.community_post_reactions
  add constraint community_post_reactions_emoji_check
  check (emoji in ('😂', '😮', '😢', '😡', '👎', '🔥', '👏'));

create or replace function public.set_community_post_reaction(
  p_post_id uuid,
  p_emoji text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_normalized_emoji text;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_post_id is null then
    raise exception 'Post bilgisi zorunludur.';
  end if;

  perform 1
  from public.community_posts cp
  where cp.id = p_post_id
    and cp.is_active = true
    and cp.status = 'approved'
  for update;

  if not found then
    raise exception 'Post bulunamadi veya aktif degil.';
  end if;

  v_normalized_emoji := nullif(btrim(coalesce(p_emoji, '')), '');
  if v_normalized_emoji is not null and v_normalized_emoji not in ('😂', '😮', '😢', '😡', '👎', '🔥', '👏') then
    raise exception 'Gecersiz reaction secimi.';
  end if;

  if v_normalized_emoji is null then
    delete from public.community_post_reactions
    where post_id = p_post_id
      and user_id = v_actor_id;
  else
    insert into public.community_post_reactions (post_id, user_id, emoji)
    values (p_post_id, v_actor_id, v_normalized_emoji)
    on conflict (post_id, user_id)
    do update set emoji = excluded.emoji, updated_at = now();
  end if;

  perform public.sync_community_post_reactions_count(p_post_id);
  return public.get_community_post_reaction_summary(p_post_id);
end;
$$;

revoke all on function public.set_community_post_reaction(uuid, text) from public;
grant execute on function public.set_community_post_reaction(uuid, text) to authenticated;
