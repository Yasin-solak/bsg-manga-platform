-- Read-only public RPCs need no definer permission.
-- These endpoints keep working with the existing anon/auth SELECT grant + RLS policy layer.

alter function public.get_active_premium_offer() security invoker;
alter function public.get_active_premium_package(text) security invoker;
alter function public.get_popular_community_tags(integer, integer) security invoker;
alter function public.get_runtime_feature_flags(text[]) security invoker;
alter function public.list_active_fansub_boost_plans() security invoker;
alter function public.list_public_release_schedule(uuid, timestamptz, integer, integer) security invoker;
alter function public.search_public_mangas_v2(text, text[], text, text, integer, integer) security invoker;

grant execute on function public.get_active_premium_offer() to anon, authenticated;
grant execute on function public.get_active_premium_package(text) to anon, authenticated;
grant execute on function public.get_popular_community_tags(integer, integer) to anon, authenticated;
grant execute on function public.get_runtime_feature_flags(text[]) to anon, authenticated;
grant execute on function public.list_active_fansub_boost_plans() to anon, authenticated;
grant execute on function public.list_public_release_schedule(uuid, timestamptz, integer, integer) to anon, authenticated;
grant execute on function public.search_public_mangas_v2(text, text[], text, text, integer, integer) to anon, authenticated;
