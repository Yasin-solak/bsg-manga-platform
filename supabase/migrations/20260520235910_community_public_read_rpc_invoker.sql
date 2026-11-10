-- Community asset and poll read RPCs can use the same visibility model as table RLS rules.
-- Reaction summary aggregates all reactions, so it stays out of this batch.

alter function public.get_community_post_asset(uuid) security invoker;
alter function public.get_community_post_assets(uuid) security invoker;
alter function public.get_community_post_poll(uuid) security invoker;

grant execute on function public.get_community_post_asset(uuid) to anon, authenticated;
grant execute on function public.get_community_post_assets(uuid) to anon, authenticated;
grant execute on function public.get_community_post_poll(uuid) to anon, authenticated;
