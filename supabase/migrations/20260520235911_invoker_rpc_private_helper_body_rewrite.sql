-- No old public helper call must remain in public RPCs moved to invoker.
-- Since public helper execute grants are closed the bodies tie to app_private helpers.

create or replace function public.get_community_post_assets(p_post_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', cpa.id,
        'postId', cpa.post_id,
        'assetType', cpa.asset_type,
        'provider', cpa.provider,
        'providerAssetId', cpa.provider_asset_id,
        'originalUrl', cpa.original_url,
        'previewUrl', cpa.preview_url,
        'width', cpa.width,
        'height', cpa.height,
        'altText', cpa.alt_text,
        'position', cpa.position,
        'metadata', cpa.metadata
      )
      order by cpa.position asc, cpa.created_at asc
    ),
    '[]'::jsonb
  )
  from public.community_post_assets cpa
  join public.community_posts cp on cp.id = cpa.post_id
  where cpa.post_id = p_post_id
    and (
      (cp.status = 'approved' and cp.is_active = true)
      or cp.author_id = app_private.current_public_user_id()
      or app_private.is_admin()
    );
$function$;

create or replace function public.get_community_post_poll(p_post_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_poll record;
  v_actor_id uuid;
  v_viewer_option_id uuid;
  v_viewer_has_voted boolean := false;
  v_payload jsonb;
begin
  if p_post_id is null then
    return null;
  end if;

  select cp.id as post_id, cp.status, cp.is_active, cpp.id as poll_id, cpp.closes_at, cpp.total_votes_count
  into v_poll
  from public.community_posts cp
  join public.community_post_polls cpp on cpp.post_id = cp.id
  where cp.id = p_post_id;

  if v_poll.poll_id is null then
    return null;
  end if;

  if not (
    (v_poll.status = 'approved' and v_poll.is_active = true)
    or v_poll.post_id in (
      select cp.id
      from public.community_posts cp
      where cp.id = p_post_id
        and (cp.author_id = app_private.current_public_user_id() or app_private.is_admin())
    )
  ) then
    return null;
  end if;

  v_actor_id := app_private.current_public_user_id();
  if v_actor_id is not null then
    select cppv.option_id
    into v_viewer_option_id
    from public.community_post_poll_votes cppv
    where cppv.poll_id = v_poll.poll_id
      and cppv.user_id = v_actor_id
    limit 1;

    v_viewer_has_voted := v_viewer_option_id is not null;
  end if;

  select jsonb_build_object(
    'id', v_poll.poll_id,
    'postId', p_post_id,
    'closesAt', v_poll.closes_at,
    'isClosed', (v_poll.closes_at <= now()),
    'totalVotesCount', coalesce(v_poll.total_votes_count, 0),
    'viewerHasVoted', v_viewer_has_voted,
    'viewerOptionId', v_viewer_option_id,
    'options', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cppo.id,
          'label', cppo.label,
          'position', cppo.position,
          'votesCount', cppo.votes_count
        )
        order by cppo.position asc
      )
      from public.community_post_poll_options cppo
      where cppo.poll_id = v_poll.poll_id
    ), '[]'::jsonb)
  )
  into v_payload;

  return v_payload;
end;
$function$;

create or replace function public.get_runtime_feature_flags(p_keys text[])
returns table(key text, is_enabled boolean)
language sql
stable
security invoker
set search_path = public
as $function$
  with normalized_keys as (
    select distinct lower(trim(raw_key)) as key
    from unnest(coalesce(p_keys, '{}'::text[])) as raw_key
    where trim(coalesce(raw_key, '')) <> ''
  ),
  matched_flags as (
    select
      nk.key,
      ff.is_enabled as flag_enabled,
      ff.rollout_percent as rollout_percent
    from normalized_keys nk
    left join public.feature_flags ff
      on ff.key = nk.key
     and (ff.is_public = true or app_private.is_admin())
  )
  select
    matched_flags.key,
    case
      when matched_flags.flag_enabled is null then null
      when matched_flags.flag_enabled is not true then false
      when coalesce(matched_flags.rollout_percent, 0) >= 100 then true
      when coalesce(matched_flags.rollout_percent, 0) <= 0 then false
      when auth.uid() is null then false
      else (
        (
          abs(
            ('x' || substr(md5(auth.uid()::text || ':' || matched_flags.key), 1, 8))::bit(32)::bigint
          ) % 100
        )::integer < matched_flags.rollout_percent
      )
    end as is_enabled
  from matched_flags;
$function$;

grant execute on function public.get_community_post_assets(uuid) to anon, authenticated;
grant execute on function public.get_community_post_poll(uuid) to anon, authenticated;
grant execute on function public.get_runtime_feature_flags(text[]) to anon, authenticated;
