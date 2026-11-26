-- Close the built-in PUBLIC execute grant on SECURITY DEFINER functions in the public schema.
--
-- Root cause: migration 20260519_198 meant to make new functions closed by default with
--   alter default privileges in schema public revoke execute on functions from anon, public;
-- PostgreSQL adds per-schema default privileges on top of the global ones, so a per-schema
-- REVOKE cannot remove the built-in "EXECUTE to PUBLIC" on functions. The anon half worked (it
-- undid a per-schema grant); the PUBLIC half did nothing. Every function created since then
-- without its own "revoke ... from public" stayed callable by signed-out visitors through
-- /rest/v1/rpc/<name>, because anon inherits PUBLIC.
--
-- Live state on 2026-11-24 (Security Advisor lint 0028): 25 SECURITY DEFINER functions in public
-- were reachable by anon through PUBLIC alone; their migrations grant EXECUTE to authenticated
-- and nothing else. All 19 RPC bodies reject a signed-out caller in their first statements
-- (is_admin(), current_public_user_id() is null, auth.uid() is null), so nothing was exploitable,
-- but that body check was the only layer. The other 6 are trigger functions: PostgREST cannot
-- call them and EXECUTE is not checked when a trigger fires.
--
-- Functions that are meant to be public (shop_catalog, is_username_available, ...) carry an
-- explicit "grant execute ... to anon" and are not touched here.

-- 1) Root cause. Only the role-level form (no "in schema") can revoke a built-in default.
--    From now on a function created by postgres has no PUBLIC execute in any schema. In public it
--    still receives authenticated and service_role from the per-schema defaults; a function that
--    signed-out visitors must call needs an explicit "grant execute ... to anon", and a helper in
--    another schema that API roles reach through RLS or an invoker function needs its own grant.
alter default privileges for role postgres revoke execute on functions from public;

-- 2) Sweep the functions that are already in this state. Signatures are resolved from the
--    catalog so that an overload or a parameter change cannot leave one behind, and a fresh
--    database that does not have a function yet simply skips it.
do $$
declare
  target record;
  target_names constant text[] := array[
    -- Admin RPCs
    'admin_delete_event_quest',
    'admin_delete_quest_event',
    'admin_list_event_quests',
    'admin_list_quest_events',
    'admin_remove_reported_content',
    'admin_set_event_quest_active',
    'admin_upsert_event_quest',
    'admin_upsert_quest_event',
    -- Signed-in user and fansub staff RPCs
    'claim_quest',
    'cleanup_my_expired_premium_profile_state',
    'fansub_fix_reported_chapter',
    'fansub_submit_content_fix',
    'get_fansub_manage_overview_cockpit',
    'get_fansub_supporter_asset_usage',
    'list_active_events',
    'list_fansub_reported_content',
    'list_quests',
    'send_fansub_special_notification',
    'upsert_fansub_profile',
    -- Trigger functions
    'close_fansub_fix_on_chapter_reapprove',
    'close_fansub_fix_on_manga_reapprove',
    'close_fansub_fix_on_post_reapprove',
    'tg_quest_manga_comment',
    'tg_quest_manga_rating',
    'tg_quest_reading_history'
  ];
begin
  for target in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (target_names)
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    execute format(
      'revoke execute on function public.%I(%s) from public, anon',
      target.proname,
      target.identity_arguments
    );

    if has_function_privilege('anon', target.oid, 'EXECUTE') then
      raise exception 'public.%(%) is still executable by anon', target.proname, target.identity_arguments;
    end if;
  end loop;
end
$$;
