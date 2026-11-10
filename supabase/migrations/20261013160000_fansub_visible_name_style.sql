begin;
-- The public form of the fansub name style (PostgREST computed field).
--
-- The fansub name style is a boost perk (hasFullNameStyle). RPCs like catalog / hover gated it
-- on the server; community posts fetch the fansub via a direct table relation so they
-- never got the style. `fansub:related_fansub_id ( ..., visible_name_style )` now returns the saved style
-- with boost on, otherwise null. Level expiry stays current with a scheduled job
-- (fansub-boost-expiry), so a snapshot read is enough.
create or replace function public.visible_name_style(p_fansub public.fansubs)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when p_fansub.active_name_style is null or jsonb_typeof(p_fansub.active_name_style) <> 'object' then null
    when coalesce((
      select (s.capabilities ->> 'hasFullNameStyle')::boolean
      from public.fansub_boost_snapshots s
      where s.fansub_id = p_fansub.id
    ), false) then p_fansub.active_name_style
    else null
  end
$$;

revoke all on function public.visible_name_style(public.fansubs) from public;
grant execute on function public.visible_name_style(public.fansubs) to anon, authenticated;
commit;
