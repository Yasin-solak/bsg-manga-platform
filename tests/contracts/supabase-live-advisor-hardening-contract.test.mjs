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

const migration = read('supabase/migrations/20260519235903_live_supabase_advisor_hardening.sql')

assert.match(migration, /alter default privileges in schema public revoke execute on functions from anon, public;/)

for (const functionName of [
  'set_updated_at()',
  'normalize_username(text)',
  'search_normalize(text)',
  'is_reserved_username(text)',
]) {
  assert.match(
    migration,
    new RegExp(`alter function public\\.${functionName.replace(/[()]/g, '\\$&')} set search_path = public, pg_temp;`),
    `${functionName} search_path sabitlenmeli`,
  )
}

assert.match(migration, /create schema if not exists extensions;/)
assert.match(migration, /alter extension pg_trgm set schema extensions;/)
assert.match(migration, /search_public_mangas_v2\(text, text\[\], text, text, integer, integer\)[\s\S]*set search_path = public, extensions, pg_temp;/)

const activityPolicy = blockAfter(migration, 'create policy activity_events_select_admin')
assert.match(activityPolicy, /on public\.activity_events/)
assert.match(activityPolicy, /to authenticated/)
assert.match(activityPolicy, /public\.current_app_role\(\) = 'admin'/)

for (const policyName of [
  'Public read avatars',
  'Public read chapter pages',
  'Public read manga covers',
  'Public read store assets',
  'store_assets_public_read',
]) {
  assert.match(migration, new RegExp(`drop policy if exists "${policyName}" on storage\\.objects;`))
}

for (const [policyName, bucketId] of [
  ['Admin list avatars', 'avatars'],
  ['Admin list chapter pages', 'chapter-pages'],
  ['Admin list manga covers', 'manga-covers'],
  ['Admin list store assets', 'store-assets'],
]) {
  const policy = blockAfter(migration, `create policy "${policyName}"`)
  assert.match(policy, new RegExp(`bucket_id = '${bucketId}'`), `${policyName} is missing the bucket constraint`)
  assert.match(policy, /public\.current_app_role\(\) = 'admin'/, `${policyName} admin kisiti eksik`)
}

const adminGrantBlock = blockAfter(migration, 'Anonymous users must not be able to call admin RPCs.')
for (const requiredPattern of [
  "p.proname like 'admin\\_%'",
  "p.proname like 'get\\_admin\\_%'",
  "'approve_fansub_request'",
  "'reject_fansub_request'",
  "'create_admin_audit_log'",
  "'set_feature_flag'",
  "'set_user_ban_state'",
  "'set_user_role'",
  "'update_security_alert_rule'",
]) {
  assert.ok(adminGrantBlock.includes(requiredPattern), `${requiredPattern} must be in the admin revoke scope`)
}
assert.match(adminGrantBlock, /revoke execute on function %s from anon, public/)
assert.match(adminGrantBlock, /grant execute on function %s to authenticated/)

const internalGrantBlock = blockAfter(migration, 'Trigger/audit/maintenance functions are not client RPC endpoints.')
for (const requiredPattern of [
  "p.proname like 'audit\\_%'",
  "p.proname like 'capture\\_%'",
  "p.proname like 'enforce\\_%'",
  "p.proname like 'notify\\_%'",
  "p.proname like 'trg\\_%'",
  "'upsert_activity_event'",
  "'validate_manga_comment_scope'",
]) {
  assert.ok(internalGrantBlock.includes(requiredPattern), `${requiredPattern} must be in the internal revoke scope`)
}
assert.match(internalGrantBlock, /revoke execute on function %s from anon, authenticated, public/)
assert.match(internalGrantBlock, /grant execute on function %s to service_role/)

assert.match(migration, /notify pgrst, 'reload schema';/)

console.log('PASS live Supabase Advisor hardening contract kept')
