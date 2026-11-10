import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260527235908_storage_jwt_helper_definer_repair.sql',
  'utf8',
)

for (const functionName of [
  'current_auth_user_id_from_jwt',
  'current_public_user_id_from_jwt',
  'current_app_role_from_jwt',
  'is_admin_from_jwt',
  'is_fansub_staff_from_jwt',
  'can_write_pending_community_post_child_from_jwt',
]) {
  const createMarker = `create or replace function app_private.${functionName}`
  const start = migration.indexOf(createMarker)
  assert.ok(start >= 0, `${functionName} tanimi bulunamadi`)
  const nextCreate = migration.indexOf('create or replace function app_private.', start + createMarker.length)
  const body = migration.slice(start, nextCreate === -1 ? undefined : nextCreate)
  assert.match(body, /security definer/i, `${functionName} must be security definer`)
  assert.match(body, /set search_path = public, auth/i, `${functionName} must have a fixed search_path`)
}

for (const expectedGrant of [
  'grant execute on function app_private.current_auth_user_id_from_jwt() to anon, authenticated, service_role;',
  'grant execute on function app_private.current_public_user_id_from_jwt() to anon, authenticated, service_role;',
  'grant execute on function app_private.current_app_role_from_jwt() to anon, authenticated, service_role;',
  'grant execute on function app_private.is_admin_from_jwt() to anon, authenticated, service_role;',
  'grant execute on function app_private.is_fansub_staff_from_jwt(uuid) to authenticated, service_role;',
  'grant execute on function app_private.can_write_pending_community_post_child_from_jwt(uuid) to authenticated, service_role;',
]) {
  assert.match(migration, new RegExp(expectedGrant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

console.log('PASS Supabase storage JWT helper definer repair contract kept')
