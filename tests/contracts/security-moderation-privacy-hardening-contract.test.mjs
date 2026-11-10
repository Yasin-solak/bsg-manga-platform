import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function assertBefore(source, firstNeedle, secondNeedle, message) {
  const firstIndex = source.indexOf(firstNeedle)
  const secondIndex = source.indexOf(secondNeedle)
  assert.ok(firstIndex >= 0, `${message}: first check not found`)
  assert.ok(secondIndex >= 0, `${message}: second check not found`)
  assert.ok(firstIndex < secondIndex, message)
}

const migrationSource = read('supabase/migrations/20260518235901_security_moderation_privacy_hardening.sql')
const uploadWorkerSource = read('functions/_shared/storage-upload-r2.js')
const legacyUploadWorkerSource = read('functions/_shared/storage-upload.js')
const chapterUploadSource = read('functions/_shared/storage-upload-chapter-page.js')
const communityUploadSource = read('functions/_shared/storage-upload-community-post-image.js')

assert.match(migrationSource, /create or replace function public\.can_manage_moderation_state\(\)/)
assert.match(migrationSource, /auth\.role\(\) = 'service_role' or public\.is_admin\(\)/)

assert.match(migrationSource, /create or replace function public\.enforce_community_post_moderation_guard\(\)/)
assert.match(migrationSource, /trg_enforce_community_post_moderation_guard/)
assert.match(migrationSource, /status = 'pending'/)
assert.match(migrationSource, /approved_at is null/)
assert.match(migrationSource, /approved_by is null/)
assert.match(migrationSource, /rejected_at is null/)
assert.match(migrationSource, /rejected_by is null/)
assert.match(migrationSource, /reject_reason is null/)
assert.match(migrationSource, /old\.status <> 'pending'/)

for (const tableName of ['manga', 'chapter']) {
  assert.match(
    migrationSource,
    new RegExp(`create or replace function public\\.enforce_${tableName}_approval_guard\\(\\)`),
    `${tableName} approval guard fonksiyonu eksik`,
  )
  assert.match(
    migrationSource,
    new RegExp(`trg_enforce_${tableName}_approval_guard`),
    `${tableName} approval trigger eksik`,
  )
}

for (const policyName of [
  'mangas_insert_admin_or_fansub_admin',
  'mangas_update_admin_or_fansub_admin',
  'chapters_insert_admin_or_fansub_admin',
  'chapters_update_admin_or_fansub_admin',
]) {
  const policyIndex = migrationSource.indexOf(`create policy ${policyName}`)
  assert.ok(policyIndex >= 0, `${policyName} policy was not renewed`)
  const nextPolicyIndex = migrationSource.indexOf('create policy ', policyIndex + 1)
  const policyBlock = migrationSource.slice(policyIndex, nextPolicyIndex === -1 ? undefined : nextPolicyIndex)
  assert.match(policyBlock, /public\.can_manage_moderation_state\(\)/)
  assert.match(policyBlock, /coalesce\(is_approved, false\) = false/)
}

assert.match(migrationSource, /create or replace view public\.public_user_directory/)
assert.match(migrationSource, /with \(security_invoker = true\)/)
assert.match(migrationSource, /cross join lateral public\.get_profile_view_access\(u\.id\) access/)
assert.match(migrationSource, /coalesce\(access\.profile_visible, false\) = true/)
assert.match(migrationSource, /public\.resolve_user_active_fansub_identity_tag\(u\.id\) as active_fansub_identity_tag/)

for (const [label, source] of [
  ['r2 upload worker', uploadWorkerSource],
  ['legacy upload worker', legacyUploadWorkerSource],
  ['chapter upload helper', chapterUploadSource],
  ['community image upload helper', communityUploadSource],
]) {
  assert.match(source, /function assertRawFilePreflight/)
  assert.match(source, /async function normalizeUploadFileWithinLimit/)
  assert.doesNotMatch(source, /normalizeUploadFile\(rawFile\)/)
  assertBefore(
    source,
    'assertRawFilePreflight(file',
    'return normalizeUploadFile(file)',
    `${label} raw boyut preflight yapmadan normalizasyon calistirmamali`,
  )
}

console.log('PASS security moderation, privacy and upload preflight contract kept')
