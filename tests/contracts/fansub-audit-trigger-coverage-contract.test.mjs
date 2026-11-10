import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const migrationSource = read('supabase/migrations/20260415235905_fansub_audit_trigger_coverage.sql')

assert.match(migrationSource, /create or replace function public\.create_fansub_audit_log_from_trigger\s*\(/i)
assert.match(migrationSource, /This layer ties public result surfaces that can also change outside RPCs to the audit chain\./i)

assert.match(migrationSource, /create or replace function public\.audit_fansub_supporter_asset_mutation\s*\(/i)
assert.match(migrationSource, /create trigger trg_fansub_supporter_assets_audit/i)
assert.match(migrationSource, /fansub\.supporter_asset\.create/i)
assert.match(migrationSource, /fansub\.supporter_asset\.archive/i)
assert.match(migrationSource, /fansub\.supporter_asset\.presentation\.update/i)
assert.match(migrationSource, /fansub\.supporter_asset\.sort\.update/i)
assert.match(migrationSource, /fansub\.supporter_asset\.status\.update/i)

assert.match(migrationSource, /create or replace function public\.audit_fansub_identity_tag_mutation\s*\(/i)
assert.match(migrationSource, /create trigger trg_fansub_identity_tags_audit/i)
assert.match(migrationSource, /fansub\.identity_tag\.create/i)
assert.match(migrationSource, /fansub\.identity_tag\.visual\.update/i)
assert.match(migrationSource, /fansub\.identity_tag\.status\.update/i)

assert.match(migrationSource, /create or replace function public\.audit_fansub_chapter_credit_settings_mutation\s*\(/i)
assert.match(migrationSource, /create trigger trg_fansub_chapter_credit_settings_audit/i)
assert.match(migrationSource, /fansub\.chapter_credit\.settings\.create/i)
assert.match(migrationSource, /fansub\.chapter_credit\.settings\.update/i)

assert.match(migrationSource, /create or replace function public\.audit_fansub_chapter_credit_override_mutation\s*\(/i)
assert.match(migrationSource, /create trigger trg_fansub_chapter_credit_overrides_audit/i)
assert.match(migrationSource, /fansub\.chapter_credit\.override\.create/i)
assert.match(migrationSource, /fansub\.chapter_credit\.override\.update/i)
assert.match(migrationSource, /fansub\.chapter_credit\.override\.remove/i)

assert.match(migrationSource, /create or replace function public\.audit_fansub_pinned_notice_mutation\s*\(/i)
assert.match(migrationSource, /create trigger trg_fansub_pinned_notices_audit/i)
assert.match(migrationSource, /fansub\.notice\.create/i)
assert.match(migrationSource, /fansub\.notice\.update/i)

assert.match(migrationSource, /create or replace function public\.audit_fansub_special_notification_broadcast_mutation\s*\(/i)
assert.match(migrationSource, /create trigger trg_fansub_special_notification_broadcasts_audit/i)
assert.match(migrationSource, /fansub\.special_notification\.send/i)

console.log('PASS fansub audit trigger coverage contract ties public result mutations to the audit chain')
