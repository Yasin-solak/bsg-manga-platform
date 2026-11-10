-- MangaZone | Browser-side feature flag request yogunlugunu azaltan toplu snapshot RPC

create or replace function public.get_runtime_feature_flags(
  p_keys text[]
)
returns table (
  key text,
  is_enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
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
     and (ff.is_public = true or public.is_admin())
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
$$;

grant execute on function public.get_runtime_feature_flags(text[]) to anon, authenticated;
