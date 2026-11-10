-- Definer bodies in app_private are not exposed, yet must not carry a default PUBLIC EXECUTE permission.
-- The public RPC contract stays in invoker wrappers in the public schema; private bodies open only to required API roles.

alter default privileges for role postgres in schema app_private
  revoke execute on functions from public;

do $$
declare
  r record;
begin
  for r in
    select p.proname, p.proargtypes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname in (
        'get_community_post_reaction_summary',
        'get_effective_public_chapter_credit_config',
        'get_profile_view_access',
        'get_public_fansub_boost_bundle',
        'get_public_fansub_boost_snapshot',
        'get_public_fansub_supporter_asset_render_catalog',
        'get_public_fansub_tier_preview',
        'get_public_profile_stats',
        'get_public_user_profile_by_id',
        'get_public_user_profile_by_username',
        'list_public_fansub_boost_supporters_preview',
        'list_public_fansub_supporter_assets',
        'track_community_post_share',
        'track_community_post_view',
        'track_manga_read'
      )
  loop
    execute format(
      'revoke execute on function app_private.%I(%s) from public',
      r.proname,
      oidvectortypes(r.proargtypes)
    );

    execute format(
      'grant execute on function app_private.%I(%s) to anon, authenticated, service_role',
      r.proname,
      oidvectortypes(r.proargtypes)
    );
  end loop;
end $$;
