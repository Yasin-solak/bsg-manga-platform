import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const auditMigrationSource = read('supabase/migrations/20260415235903_fansub_audit_logs_and_manage_activity.sql')
const managementMigrationSource = read('supabase/migrations/20260415235902_fansub_management_security_rpc.sql')
const statsServiceSource = read('src/services/fansubManageService/stats.ts')
const statsTypeSource = read('src/services/fansubManageService/types.ts')
const statsTabSource = read('src/pages/fansubYonet/FansubYonetStatsTab.tsx')

assert.match(auditMigrationSource, /create table if not exists public\.fansub_audit_logs/i)
assert.match(auditMigrationSource, /create or replace function public\.create_fansub_audit_log\s*\(/i)
assert.match(auditMigrationSource, /create or replace function public\.upsert_fansub_profile\s*\(/i)
assert.match(auditMigrationSource, /create or replace function public\.set_fansub_member_role\s*\(/i)
assert.match(auditMigrationSource, /create or replace function public\.remove_fansub_member\s*\(/i)
assert.match(auditMigrationSource, /create or replace function public\.remove_fansub_chapter\s*\(/i)
assert.match(auditMigrationSource, /fansub_audit_logs_select_rule/)
assert.match(auditMigrationSource, /recent_activity_rows as \(/i)
assert.match(auditMigrationSource, /'recentActivity', ra\.items/i)
assert.match(auditMigrationSource, /Critical actions travel with the same payload in the stats load;/)

assert.match(managementMigrationSource, /perform public\.create_fansub_audit_log\(\s*v_row\.id,/i)
assert.match(managementMigrationSource, /perform public\.create_fansub_audit_log\(\s*p_fansub_id,\s*'fansub\.member\.role\.update'/i)
assert.match(managementMigrationSource, /perform public\.create_fansub_audit_log\(\s*p_fansub_id,\s*'fansub\.member\.remove'/i)
assert.match(managementMigrationSource, /perform public\.create_fansub_audit_log\(\s*v_fansub_id,\s*'fansub\.chapter\.remove'/i)

assert.match(statsTypeSource, /export interface FansubManageAnalyticsActivityItem/)
assert.match(statsTypeSource, /recentActivity: FansubManageAnalyticsActivityItem\[]/)
assert.match(statsServiceSource, /function mapActivityItem\b/)
assert.match(statsServiceSource, /payload\?\.recentActivity/)
// Studyo v2: baslik tam Turkce (UI metni); audit paneli korunur.
assert.match(statsTabSource, /Son y[oö]netim hareketleri/)
assert.match(statsTabSource, /kritik hareketler burada izlenir/i)
assert.match(statsTabSource, /<ActivityRow key=\{item\.id\} item=\{item\} \/>/, 'audit satirlari listelenmeli')
assert.match(statsTabSource, /function ActivityRow\b/)

console.log('PASS fansub manage audit contract keeps the critical tracking chain')
