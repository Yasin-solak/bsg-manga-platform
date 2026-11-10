import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function blockAfter(source, marker, endMarker = '\n\n') {
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `${marker} bulunamadi`)
  const end = source.indexOf(endMarker, start + marker.length)
  return source.slice(start, end === -1 ? undefined : end)
}

const migrationSource = read('supabase/migrations/20260519235901_security_privacy_integrity_followup.sql')
const adminUserQueriesSource = read('src/services/adminUserService/queries.ts')
const uploadWorkerSource = read('functions/_shared/storage-upload-r2.js')
const legacyUploadWorkerSource = read('functions/_shared/storage-upload.js')

assert.match(migrationSource, /create or replace function public\.can_read_public_user_row\(p_user_id uuid\)/)
assert.match(migrationSource, /create policy users_select_active[\s\S]*public\.can_read_public_user_row\(id\)/)
assert.match(migrationSource, /revoke select on public\.users from anon, authenticated;/)

const usersGrantBlock = blockAfter(migrationSource, 'grant select (', ') on public.users to anon, authenticated;')
assert.match(usersGrantBlock, /username_slug/)
assert.match(usersGrantBlock, /active_profile_effect_id/)
for (const sensitiveColumn of [
  'auth_user_id',
  'social_links',
  'premium_expires_at',
  'ban_reason',
  'ban_until',
  'stones',
  'owned_items',
  'active_session_id',
]) {
  assert.doesNotMatch(usersGrantBlock, new RegExp(`\\b${sensitiveColumn}\\b`), `${sensitiveColumn} must not be in the direct users grant`)
}

assert.match(migrationSource, /create view public\.admin_user_directory/)
assert.match(migrationSource, /where public\.can_manage_moderation_state\(\)/)
assert.match(adminUserQueriesSource, /\.from\('admin_user_directory'\)/)
assert.doesNotMatch(adminUserQueriesSource, /\.from\('users'\)/)

assert.match(migrationSource, /create or replace function public\.get_upload_auth_context\(\)/)
for (const [label, source] of [
  ['r2 upload worker', uploadWorkerSource],
  ['legacy upload worker', legacyUploadWorkerSource],
]) {
  assert.match(source, /\.rpc\('get_upload_auth_context'\)/, `${label} upload auth RPC kullanmali`)
  assert.doesNotMatch(source, /\.from\('users'\)/, `${label} users tablosuna dogrudan gitmemeli`)
  assert.doesNotMatch(source, /\.eq\('auth_user_id'/, `${label} auth_user_id filtresi kullanmamali`)
}

for (const [tableName, triggerName] of [
  ['community_comments', 'trg_enforce_community_comment_integrity'],
  ['manga_comments', 'trg_enforce_manga_comment_integrity'],
  ['user_manga_list_comments', 'trg_enforce_user_manga_list_comment_integrity'],
]) {
  assert.match(migrationSource, new RegExp(`on public\\.${tableName}`), `${tableName} trigger hedefi eksik`)
  assert.match(migrationSource, new RegExp(triggerName), `${triggerName} eksik`)
}

for (const rpcName of [
  'set_community_comment_reaction',
  'set_manga_comment_reaction',
  'set_user_manga_list_comment_reaction',
]) {
  assert.match(migrationSource, new RegExp(`is_trusted_mutation_stack\\('${rpcName}'\\)`), `${rpcName} sayac istisnasi eksik`)
}

assert.match(migrationSource, /raise exception 'Yorum reaksiyon sayaclari yalniz RPC ile degistirilebilir\.'/)
assert.match(migrationSource, /new\.is_pinned := false/)
assert.match(migrationSource, /drop trigger if exists manga_comments_pin_admin_guard/)

for (const tableName of [
  'community_post_assets',
  'community_post_polls',
  'community_post_poll_options',
]) {
  assert.match(migrationSource, new RegExp(`on public\\.${tableName}`), `${tableName} child guard kapsami eksik`)
}

assert.match(migrationSource, /create or replace function public\.can_write_pending_community_post_child/)
assert.match(migrationSource, /cp\.status = 'pending'/)
assert.match(migrationSource, /create or replace function public\.can_write_pending_community_poll_child/)
assert.match(migrationSource, /is_trusted_mutation_stack\('sync_community_post_poll_counts'\)/)

for (const policyName of [
  'community_post_assets_insert_self_or_admin',
  'community_post_assets_update_self_or_admin',
  'community_post_assets_delete_self_or_admin',
  'community_post_polls_insert_self_or_admin',
  'community_post_polls_update_self_or_admin',
  'community_post_polls_delete_self_or_admin',
  'community_post_poll_options_insert_self_or_admin',
  'community_post_poll_options_update_self_or_admin',
  'community_post_poll_options_delete_self_or_admin',
]) {
  const policyBlock = blockAfter(migrationSource, `create policy ${policyName}`)
  assert.match(policyBlock, /can_write_pending_community_(post|poll)_child/, `${policyName} pending helper kullanmali`)
}

const storagePolicyBlock = blockAfter(migrationSource, 'create policy "Community post image upload own pending posts"')
assert.match(storagePolicyBlock, /on storage\.objects/)
assert.match(storagePolicyBlock, /bucket_id = 'store-assets'/)
assert.match(storagePolicyBlock, /storage\.foldername\(name\)\)\[2\] = 'posts'/)
assert.match(storagePolicyBlock, /can_write_pending_community_post_child/)
assert.doesNotMatch(storagePolicyBlock, /public\.is_admin\(\)/, 'the storage fallback must not use the old admin helper')

assert.match(migrationSource, /create or replace function public\.enforce_legal_request_public_workflow_guard\(\)/)
assert.match(migrationSource, /new\.status := 'new'/)
assert.match(migrationSource, /new\.priority := public\.default_legal_request_priority\(new\.request_type\)/)
assert.match(migrationSource, /admin_notes is null/)
assert.match(migrationSource, /resolution_summary is null/)
assert.match(migrationSource, /reviewed_by is null/)
assert.match(migrationSource, /reviewed_at is null/)

assert.match(migrationSource, /create or replace function public\.enforce_report_public_workflow_guard\(\)/)
assert.match(migrationSource, /new\.status := 'pending'/)
assert.match(migrationSource, /new\.resolved_at := null/)
assert.match(migrationSource, /new\.resolved_by := null/)
assert.match(migrationSource, /reports_insert_self[\s\S]*status = 'pending'[\s\S]*resolved_at is null[\s\S]*resolved_by is null/)

console.log('PASS security privacy and data integrity follow-up contract kept')
