import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260527235907_storage_acl_and_helper_grants_repair.sql',
  'utf8',
)

for (const expected of [
  'grant usage on schema app_private to anon, authenticated, service_role;',
  'grant usage on schema storage to authenticated, service_role;',
  'grant execute on function public.current_auth_session_id() to anon, authenticated, service_role;',
  'grant execute on function public.is_auth_session_revoked(uuid, uuid) to anon, authenticated, service_role;',
  'grant execute on function app_private.current_auth_user_id_from_jwt() to anon, authenticated, service_role;',
  'grant execute on function app_private.current_public_user_id_from_jwt() to anon, authenticated, service_role;',
  'grant execute on function app_private.current_app_role_from_jwt() to anon, authenticated, service_role;',
  'grant execute on function app_private.is_admin_from_jwt() to anon, authenticated, service_role;',
  'grant execute on function app_private.is_fansub_staff_from_jwt(uuid) to authenticated, service_role;',
  'grant execute on function app_private.can_write_pending_community_post_child_from_jwt(uuid) to authenticated, service_role;',
  'grant select on table storage.buckets to authenticated, service_role;',
  'grant select, insert, update, delete on table storage.objects to authenticated, service_role;',
  "notify pgrst, 'reload schema';",
]) {
  assert.match(migration, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

console.log('PASS Supabase storage ACL and helper grant repair contract kept')
