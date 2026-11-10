import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function policyBlock(source, policyName) {
  const marker = `create policy ${policyName}`
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `${policyName} policy eksik`)
  const end = source.indexOf('\n\n', start)
  return source.slice(start, end === -1 ? undefined : end)
}

const migration = read('supabase/migrations/20260519235902_security_advisor_error_cleanup.sql')

assert.match(migration, /alter view if exists public\.admin_stats\s+set \(security_invoker = true\);/)
assert.match(migration, /create or replace function public\.get_admin_user_directory_rows\(\)/)
assert.match(migration, /if not public\.can_manage_moderation_state\(\) then\s+return;/)
assert.match(migration, /create view public\.admin_user_directory\s+with \(security_invoker = true, security_barrier = true\)/)
assert.match(migration, /from public\.get_admin_user_directory_rows\(\)/)
assert.match(migration, /grant select on public\.admin_user_directory to authenticated;/)

for (const tableName of [
  'user_notification_preferences',
  'store_profile_effect_assets',
  'fansub_identity_badge_catalog',
  'fansub_identity_tags',
  'user_selected_fansub_identity_tags',
  'fansub_boost_capability_policies',
]) {
  assert.match(
    migration,
    new RegExp(`alter table public\\.${tableName} enable row level security;`),
    `${tableName} RLS enable edilmeli`,
  )
}

assert.match(policyBlock(migration, 'user_notification_preferences_select_own'), /user_id = public\.current_public_user_id\(\)/)
assert.match(policyBlock(migration, 'user_notification_preferences_update_own'), /with check \(user_id = public\.current_public_user_id\(\) or public\.can_manage_moderation_state\(\)\)/)

assert.match(policyBlock(migration, 'store_profile_effect_assets_select_public_active'), /is_active = true or public\.can_manage_moderation_state\(\)/)
assert.match(policyBlock(migration, 'store_profile_effect_assets_admin_write'), /for all[\s\S]*public\.can_manage_moderation_state\(\)/)

assert.match(policyBlock(migration, 'fansub_identity_badge_catalog_select_public'), /using \(true\)/)
assert.match(policyBlock(migration, 'fansub_identity_tags_select_public_active'), /tag.is_active|is_active = true/)
assert.match(policyBlock(migration, 'fansub_identity_tags_staff_write'), /public\.is_fansub_admin\(fansub_id\)/)
assert.match(policyBlock(migration, 'user_selected_fansub_identity_tags_delete_own'), /user_id = public\.current_public_user_id\(\)/)

assert.match(policyBlock(migration, 'fansub_boost_capability_policies_select_public'), /using \(true\)/)
assert.match(policyBlock(migration, 'fansub_boost_capability_policies_admin_write'), /public\.can_manage_moderation_state\(\)/)

assert.match(migration, /grant select on public\.store_profile_effect_assets to anon, authenticated;/)
assert.match(migration, /grant select on public\.fansub_identity_badge_catalog to anon, authenticated;/)
assert.match(migration, /grant select on public\.fansub_boost_capability_policies to anon, authenticated;/)

console.log('PASS Supabase Security Advisor error cleanup contract kept')
