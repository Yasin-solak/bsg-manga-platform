-- Supabase Advisor hardening follow-up for the live bsgmanga project.
-- This migration keeps public read URLs working while removing broad API
-- listing grants and anonymous access to privileged RPC surfaces.

begin;

-- Future functions should not become anonymous RPC endpoints by default.
alter default privileges in schema public revoke execute on functions from anon, public;

-- Security Advisor: mutable search_path on utility functions.
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.normalize_username(text) set search_path = public, pg_temp;
alter function public.search_normalize(text) set search_path = public, pg_temp;
alter function public.is_reserved_username(text) set search_path = public, pg_temp;

-- Security Advisor: pg_trgm should not live in the exposed public schema.
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
alter extension pg_trgm set schema extensions;
alter function public.search_public_mangas_v2(text, text[], text, text, integer, integer)
  set search_path = public, extensions, pg_temp;

-- Security Advisor: RLS enabled but no policy. The table is an internal event
-- ledger, so direct Data API access stays admin-only.
do $$
begin
  if to_regclass('public.activity_events') is not null then
    drop policy if exists activity_events_select_admin on public.activity_events;
    create policy activity_events_select_admin
      on public.activity_events
      for select
      to authenticated
      using (public.current_app_role() = 'admin');
  end if;
end;
$$;

-- Security Advisor: public buckets do not need broad SELECT policies for known
-- public object URLs. Admin-only SELECT keeps maintenance tools such as the
-- legacy WebP converter able to list/download objects.
drop policy if exists "Public read avatars" on storage.objects;
drop policy if exists "Public read chapter pages" on storage.objects;
drop policy if exists "Public read manga covers" on storage.objects;
drop policy if exists "Public read store assets" on storage.objects;
drop policy if exists "store_assets_public_read" on storage.objects;
drop policy if exists "Admin list avatars" on storage.objects;
drop policy if exists "Admin list chapter pages" on storage.objects;
drop policy if exists "Admin list manga covers" on storage.objects;
drop policy if exists "Admin list store assets" on storage.objects;

create policy "Admin list avatars"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatars' and public.current_app_role() = 'admin');

create policy "Admin list chapter pages"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'chapter-pages' and public.current_app_role() = 'admin');

create policy "Admin list manga covers"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'manga-covers' and public.current_app_role() = 'admin');

create policy "Admin list store assets"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'store-assets' and public.current_app_role() = 'admin');

-- Anonymous users must not be able to call admin RPCs. Authenticated admin users
-- keep access because the functions already enforce is_admin/current_app_role.
do $$
declare
  function_record record;
begin
  for function_record in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        p.proname like 'admin\_%' escape '\'
        or p.proname like 'get\_admin\_%' escape '\'
        or p.proname like 'update\_admin\_%' escape '\'
        or p.proname in (
          'approve_fansub_request',
          'reject_fansub_request',
          'create_admin_audit_log',
          'find_admin_user_ids_by_username',
          'set_feature_flag',
          'set_user_ban_state',
          'set_user_role',
          'update_security_alert_rule',
          'get_security_overview',
          'list_security_alert_mutes',
          'list_security_alert_rules',
          'list_security_alerts',
          'list_security_events',
          'list_redeem_anomaly_users',
          'clear_security_alert_mute',
          'set_security_alert_mute',
          'set_security_alert_status',
          'run_fansub_monthly_rewards',
          'update_admin_boost_capability_policy'
        )
      )
  loop
    execute format('revoke execute on function %s from anon, public', function_record.signature);
    execute format('grant execute on function %s to authenticated', function_record.signature);
  end loop;
end;
$$;

-- Trigger/audit/maintenance functions are not client RPC endpoints. Revoking
-- direct EXECUTE does not stop triggers from firing, but removes exposed RPCs.
do $$
declare
  function_record record;
begin
  for function_record in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        p.proname like 'audit\_%' escape '\'
        or p.proname like 'capture\_%' escape '\'
        or p.proname like 'cleanup\_%' escape '\'
        or p.proname like 'enforce\_%' escape '\'
        or p.proname like 'notify\_%' escape '\'
        or p.proname like 'sync\_%' escape '\'
        or p.proname like 'trg\_%' escape '\'
        or p.proname in (
          'create_fansub_audit_log_from_trigger',
          'create_initial_fansub_supporter_asset_revision',
          'default_legal_request_priority',
          'prevent_non_admin_sensitive_user_updates',
          'process_security_event_alerts',
          'prune_activity_events',
          'release_expired_bans',
          'refresh_all_fansub_boost_snapshot_capabilities',
          'refresh_fansub_boost_snapshot',
          'refresh_fansub_boost_supporter_state',
          'refresh_user_manga_list_stats',
          'rewrite_legacy_user_avatar_url',
          'set_fansub_supporter_asset_actor_fields',
          'upsert_activity_event',
          'validate_manga_comment_scope',
          'validate_user_manga_list_comment_scope'
        )
      )
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', function_record.signature);
    execute format('grant execute on function %s to service_role', function_record.signature);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
