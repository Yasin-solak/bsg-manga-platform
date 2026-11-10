import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260527235909_storage_helper_owner_repair.sql',
  'utf8',
)

for (const expected of [
  'alter function public.current_auth_session_id() owner to postgres;',
  'alter function public.is_auth_session_revoked(uuid, uuid) owner to postgres;',
  'alter function app_private.current_auth_user_id_from_jwt() owner to postgres;',
  'alter function app_private.current_public_user_id_from_jwt() owner to postgres;',
  'alter function app_private.current_app_role_from_jwt() owner to postgres;',
  'alter function app_private.is_admin_from_jwt() owner to postgres;',
  'alter function app_private.is_fansub_staff_from_jwt(uuid) owner to postgres;',
  'alter function app_private.can_write_pending_community_post_child_from_jwt(uuid) owner to postgres;',
  "notify pgrst, 'reload schema';",
]) {
  assert.match(migration, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

console.log('PASS Supabase storage helper owner repair contract kept')
