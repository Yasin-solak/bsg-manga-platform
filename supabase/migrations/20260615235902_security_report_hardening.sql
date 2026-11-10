begin;

create schema if not exists app_private;

-- Why: even with Cloudflare/R2 as the production upload path legacy Supabase Storage
-- policies use this helper. To match the R2 route contract on media write/delete
-- permission only a fansub admin is accepted, not a moderator.
create or replace function app_private.is_fansub_staff_from_jwt(p_fansub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $function$
  select exists (
    select 1
    from public.fansub_members fm
    join public.fansubs f on f.id = fm.fansub_id
    where fm.fansub_id = p_fansub_id
      and fm.user_id = app_private.current_public_user_id_from_jwt()
      and fm.role = 'admin'
      and f.is_active = true
  );
$function$;

comment on function app_private.is_fansub_staff_from_jwt(uuid)
  is 'Supabase Storage legacy write policy helper. R2 upload sozlesmesiyle uyum icin yalniz fansub admin true doner.';

revoke all on function app_private.is_fansub_staff_from_jwt(uuid) from public;
grant execute on function app_private.is_fansub_staff_from_jwt(uuid) to authenticated, service_role;

revoke execute on function app_private.store_revoke_user_order_entitlements(uuid) from public, anon, authenticated;
grant execute on function app_private.store_revoke_user_order_entitlements(uuid) to service_role;

revoke execute on function app_private.store_revoke_fansub_order_entitlements(uuid) from public, anon, authenticated;
grant execute on function app_private.store_revoke_fansub_order_entitlements(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
