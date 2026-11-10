import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { untranslate } from './i18n-source.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  const absolutePath = path.join(rootDir, relativePath)
  assert.equal(existsSync(absolutePath), true, `${relativePath} bulunamadi`)
  return untranslate(readFileSync(absolutePath, 'utf8'))
}

const migration = readSource('supabase/migrations/20260723223000_admin_fansub_management_read_model.sql')
const section = readSource('src/components/admin/FansubManagementSection.tsx')
const pane = readSource('src/components/admin/fansubs/FansubDetailPane.tsx')
const communityService = readSource('src/services/communityAdminService.ts')
const communityMigration = readSource('supabase/migrations/20261103120000_community_v2_admin_fansub_server.sql')
const detailModal = readSource('src/components/admin/fansubs/AdminFansubDetailModal.tsx')
const overviewTab = readSource('src/components/admin/fansubs/FansubOverviewTab.tsx')
const membersTab = readSource('src/components/admin/fansubs/FansubMembersTab.tsx')
const mangasTab = readSource('src/components/admin/fansubs/FansubMangasTab.tsx')
const economyTab = readSource('src/components/admin/fansubs/FansubEconomyTab.tsx')
const moderationTab = readSource('src/components/admin/fansubs/AdminFansubModerationTab.tsx')
const managementService = readSource('src/services/adminService/fansubs.management.ts')
const legacyService = readSource('src/services/adminService/fansubs.list.ts')
const types = readSource('src/services/adminService/types.ts')
const utils = readSource('src/components/admin/fansubs/fansubManagementUtils.tsx')

assert.ok(migration.split(/\r?\n/).length < 750, 'Fansub read-model migrationi 750 satirin altinda kalmali')
assert.doesNotMatch(migration, /create index concurrently/i, 'Transaction icinde CONCURRENTLY kullanilmamali')
assert.doesNotMatch(
  migration,
  /pg_catalog\.extract\s*\([^)]*\bfrom\b/i,
  'EXTRACT special SQL syntax must not be qualified with pg_catalog like a function',
)
assert.doesNotMatch(
  migration,
  /pg_catalog\.(?:greatest|least)\s*\(/i,
  'GREATEST and LEAST conditional expressions must not be qualified like pg_catalog functions',
)
assert.match(
  migration,
  /pg_catalog\.date_part\('epoch', v_as_of - v_fansub\.created_at\)/i,
  'fansub age must be computed with parseable date_part syntax',
)
assert.match(migration, /^begin;/m)
assert.match(migration, /^commit;/m)

assert.match(migration, /function app_private\.get_admin_fansub_trust_v1\(/i)
assert.match(migration, /'algorithmVersion', 'fansub-trust-v1'/)
for (const component of [
  'baseline',
  'verification',
  'tenure',
  'management',
  'activity',
  'content-approval',
  'open-reviews',
  'status',
]) {
  assert.match(migration, new RegExp(`'key', '${component}'`), `${component} guven bileseni korunmali`)
}
assert.match(migration, /v_score := greatest\(0, least\(100, v_score\)\)/i)
assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i)
assert.match(migration, /app_private\.is_admin\(\)/i)
assert.match(migration, /errcode = '42501'/i)
assert.match(migration, /errcode = '22023'/i)
assert.match(migration, /v_limit < 1 or v_limit > 50/i)
assert.match(migration, /char_length\(v_search\) > 160/i)

for (const privateRpc of [
  'get_admin_fansub_management_overview',
  'list_admin_fansub_management_page',
  'admin_set_fansub_verified',
]) {
  assert.match(migration, new RegExp(`function app_private\\.${privateRpc}`), `${privateRpc} must be in the private core`)
}
for (const publicRpc of [
  'get_admin_fansub_management_overview',
  'list_admin_fansub_management_page',
  'admin_set_fansub_verified',
]) {
  assert.match(
    migration,
    new RegExp(`function public\\.${publicRpc}[\\s\\S]{0,260}?security invoker`, 'i'),
    `${publicRpc} public surface must be invoker`,
  )
}
assert.doesNotMatch(
  migration,
  /function public\.admin_set_fansub_verified[\s\S]{0,260}?security definer/i,
  'the write RPC core must not be definer in the exposed public schema',
)
assert.match(migration, /for update;/i, 'the verification update must use a row lock')
assert.match(migration, /fansub\.verification\.update/)
assert.match(migration, /insert into public\.fansub_audit_logs/i)
assert.match(migration, /revoke all on function public\.admin_set_fansub_verified[\s\S]*from public;/i)
assert.match(migration, /grant execute on function public\.admin_set_fansub_verified[\s\S]*to authenticated, service_role;/i)

assert.match(managementService, /supabase\.rpc\('get_admin_fansub_management_overview'\)/)
assert.match(managementService, /supabase\.rpc\('list_admin_fansub_management_page'/)
assert.match(managementService, /import \{ z \} from 'zod'/)
assert.match(managementService, /managementOverviewPayloadSchema\.safeParse/)
assert.match(managementService, /managementPagePayloadSchema\.safeParse/)
assert.match(managementService, /withServiceTimeout/)
assert.match(managementService, /withAbortSignal/)
assert.match(managementService, /\.strict\(\)/)
assert.match(managementService, /isMissingRpcError/)
assert.match(managementService, /listAdminFansubsPage/)
assert.doesNotMatch(managementService, /supabase\.rpc\('app_private\./)
assert.match(legacyService, /\.gte\('created_at', new Date\(Date\.now\(\) - 7 \* 86_400_000\)\.toISOString\(\)\)/)
assert.match(types, /export interface AdminFansubTrustSummary/)
assert.match(types, /algorithmVersion: string/)

// Fansubs v2 desk (2026-11-03): summary strip = view (from the server summary),
// paged list + selected team panel (on the right at desk size, a Sheet on narrow screens).
for (const [value, label] of [
  ['all', 'T\u00fcm fansublar'],
  ['active', 'Aktif'],
  ['inactive', 'Pasif'],
  ['new', 'Yeni \\(7 g\u00fcn\\)'],
  ['verified', 'Do\u011frulanm\u0131\u015f'],
]) {
  assert.match(section, new RegExp(`id: '${value}', label: '${label}'`), `${label} view must be kept`)
}
assert.match(section, /const value = overview \? view\.count\(overview\) : null/, 'strip numbers come from the server summary')
assert.match(section, /useDeskLayout\(\)/)
assert.match(section, /xl:grid-rows-\[minmax\(0,1fr\)\]/)
assert.match(section, /min-h-0 divide-y divide-border\/50 overflow-y-auto/)
assert.match(section, /onOpenAutoFocus=\{focusSheetContainer\}/)
assert.match(utils, /export const FANSUBS_PER_PAGE = 20\b/)

// Pasife alma ekip uyeliklerini sonlandirir: sonucu soyleyen pencereden gecer.
assert.match(section, /<AdminConfirmDialog/)
assert.match(section, /yeniden etkinle\u015ftirmek \u00fcyelikleri geri getirmez/)
assert.match(section, /destructive: true,/)

// Community: the fansub's community_v2 server in the panel; opens directly on the Community page.
assert.match(communityMigration, /elsif p_action = 'fansub_server' then/)
assert.match(communityMigration, /where fansub_id = nullif\(p->>'fansub_id', ''\)::uuid/)
assert.match(communityService, /fansubServer: async \(fansubId: string/)
assert.match(pane, /communityAdmin\.fansubServer\(fansub\.id/)
assert.match(pane, /\?sunucu=\$\{current\.server\.id\}/)
assert.match(pane, /data-testid="admin-fansub-community"/)

for (const tab of ['overview', 'members', 'mangas', 'economy', 'moderation']) {
  assert.match(detailModal, new RegExp(`value: '${tab}'`), `${tab} detail tab must be kept`)
}
assert.match(detailModal, /sm:w-\[min\(95vw,56rem\)\]/)
assert.match(detailModal, /data-testid="admin-fansub-detail-content"/)
assert.doesNotMatch(detailModal, /overflow-y-scroll/, 'Detay penceresi zorunlu scrollbar dayatmamali')
assert.match(overviewTab, /Fansub Sağlığı/)
assert.match(membersTab, /Toplam Üye/)
assert.match(mangasTab, /En çok okunan seriler/)
assert.match(mangasTab, /Son güncellenen seri/)
assert.match(economyTab, /Toplam envanter/)
assert.match(economyTab, /Coin İşlem Geçmişi/)
assert.match(moderationTab, /Denetlenebilir Olay Akışı/)

console.log('PASS admin fansub management UI, data and trust contract kept')
