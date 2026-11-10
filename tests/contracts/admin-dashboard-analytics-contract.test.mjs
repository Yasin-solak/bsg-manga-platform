import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  const absolutePath = path.join(rootDir, relativePath)
  assert.equal(existsSync(absolutePath), true, `${relativePath} bulunamadi`)
  return readFileSync(absolutePath, 'utf8')
}

const migration = readSource('supabase/migrations/20260714183020_admin_dashboard_analytics_read_model.sql')
const indexes = readSource('supabase/migrations/20260714184219_admin_dashboard_analytics_indexes.sql')
const service = readSource('src/services/adminService/dashboardAnalytics.ts')
const serviceExports = readSource('src/services/adminService.ts')
const e2eMock = readSource('src/testing/adminDashboardAnalyticsMock.ts')
const reportActions = readSource('src/services/reportService/actions.ts')

assert.ok(migration.split(/\r?\n/).length < 750, 'the RPC migration file must stay under 750 lines')
assert.ok(indexes.split(/\r?\n/).length < 100, 'the index migration file must stay under 100 lines')

assert.match(migration, /function app_private\.get_admin_dashboard_snapshot\(\s*p_period text,\s*p_as_of timestamptz\s*\)/i)
assert.match(migration, /security definer\s+set search_path = ''/i)
assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i)
assert.match(migration, /app_private\.is_admin\(\)/i)
assert.match(migration, /errcode = '42501'/i)
assert.doesNotMatch(migration, /pg_catalog\.(?:coalesce|least|greatest|nullif)\s*\(/i)

assert.match(migration, /v_period not in \('7d', '30d', 'month'\)/i)
assert.match(migration, /errcode = '22023'/i)
assert.match(migration, /Europe\/Istanbul/)
assert.match(migration, /app_private\.is_feature_enabled\('moderation\.reports', false\)/i)
assert.match(migration, /'comparisonBasis', 'arrivals'/)

const openItemsStart = migration.indexOf('open_items as materialized')
const openItemsEnd = migration.indexOf('content_revision_arrivals as materialized')
assert.ok(openItemsStart >= 0 && openItemsEnd > openItemsStart, 'open queue CTE limits must exist')
const openItems = migration.slice(openItemsStart, openItemsEnd)
assert.match(openItems, /'approval'::text as queue_key,\s*'manga:'[\s\S]*?from public\.mangas/i)
assert.match(openItems, /select\s+'approval',\s*'chapter:'[\s\S]*?from public\.chapters/i)
assert.match(openItems, /select 'approval', 'fansub_request:'[\s\S]*?from public\.fansub_requests/i)
assert.match(openItems, /select 'community', 'community_post:'[\s\S]*?from public\.community_posts/i)
assert.doesNotMatch(openItems, /'approval'\s*,\s*'community_post:/i, 'must not count twice in the community approval queue')
assert.match(migration, /count\(distinct a\.arrival_key\)/i, 'the period comparison must be unique over arrivals')
assert.match(migration, /count\(distinct o\.work_key\)/i, 'the current backlog must count by unique job key')
assert.doesNotMatch(migration, /'content_revision:'\s*\|\|\s*r\.id/i, 'revision attempts must not inflate the same job')
assert.match(migration, /r\.target_type \|\| ':' \|\| r\.target_id::text as arrival_key/i)
assert.match(migration, /r\.reviewed_at as terminal_at/i)
assert.match(migration, /a\.terminal_at < v_current_end/i)
assert.match(migration, /a\.terminal_at < v_previous_end/i)
assert.match(migration, /count\(distinct a\.arrival_key\) filter/i, 'Kalite kohortlari da benzersiz is saymali')
assert.match(migration, /r\.status in \('resolved', 'dismissed'\)/i, 'Genel moderasyon dismissed raporu da terminal saymali')
assert.match(migration, /a\.outcome = 'resolved'/i, 'report resolution rate must not count dismissed records as resolved')
assert.match(reportActions, /resolved_at: status === 'pending' \? null : new Date\(\)\.toISOString\(\)/)

assert.match(migration, /avg\(q\.rate\)/i)
assert.match(migration, /'source', 'quality_average'/)
assert.match(migration, /API, veritabani veya depolama telemetrisi degildir\./)
assert.doesNotMatch(migration, /pg_stat_|storage\.objects|platform_health/i, 'Olculmeyen platform telemetrisi uretilmemeli')

assert.match(migration, /function public\.get_admin_dashboard_snapshot/i)
assert.match(migration, /security invoker\s+set search_path = ''/i)
assert.match(migration, /revoke all on function app_private\.get_admin_dashboard_snapshot[\s\S]*from public, anon, authenticated;/i)
assert.match(migration, /grant execute on function app_private\.get_admin_dashboard_snapshot[\s\S]*to authenticated, service_role;/i)
assert.match(migration, /revoke all on function public\.get_admin_dashboard_snapshot[\s\S]*from public, anon, authenticated;/i)
assert.match(migration, /grant execute on function public\.get_admin_dashboard_snapshot[\s\S]*to authenticated, service_role;/i)

assert.doesNotMatch(indexes, /create index concurrently/i, 'CONCURRENTLY must not be used, for migration runner transaction compatibility')
assert.equal(
  (indexes.match(/create index if not exists/gi) || []).length,
  11,
  'all dashboard indexes must use a rerunnable, transaction-compatible setup',
)
assert.match(indexes, /mangas_admin_dashboard_pending_created_at_idx/)
assert.match(indexes, /chapters_admin_dashboard_pending_created_at_idx/)
assert.match(indexes, /fansub_requests_admin_dashboard_created_at_idx/)
assert.match(indexes, /pending_content_revisions_admin_dashboard_created_at_idx/)
assert.match(indexes, /community_posts_admin_dashboard_pending_created_at_idx/)
assert.match(indexes, /reports_admin_dashboard_pending_created_at_idx/)
assert.match(indexes, /legal_requests_admin_dashboard_open_created_at_idx/)

assert.match(service, /import \{ z \} from 'zod'/)
assert.match(service, /export type AdminDashboardPeriod/)
assert.match(service, /export type AdminDashboardMetricKey/)
assert.match(service, /export type AdminDashboardSnapshot/)
assert.match(service, /export async function getAdminDashboardSnapshot/)
assert.match(service, /supabase\.rpc\('get_admin_dashboard_snapshot', \{ p_period: safePeriod \}\)/)
assert.match(service, /adminDashboardSnapshotSchema\.safeParse/)
assert.match(service, /\.strict\(\)\.superRefine/)
assert.match(service, /nullable\(\)/, 'Eksik veya olculemeyen degerler sifira zorlanmamali')
assert.doesNotMatch(service, /data\s*\|\|\s*\{|data\s*\?\?\s*\{/, 'Eksik snapshot bos/sifir nesneye cevrilmemeli')
assert.match(serviceExports, /export \* from '\.\/adminService\/dashboardAnalytics'/)

assert.match(e2eMock, /const GENERATED_AT = '2026-07-14T17:55:00\.000Z'/)
assert.match(e2eMock, /createAdminDashboardAnalyticsMock/)
assert.match(e2eMock, /quality_average/)
assert.doesNotMatch(e2eMock, /Date\.now\(\)|new Date\(\)/, 'the E2E mock must be clock independent and deterministic')
assert.doesNotMatch(e2eMock, /\b(?:deneme|qwe|asdf)\b/i, 'the E2E mock must use presentable data')

console.log('PASS admin dashboard analytics read-model contract kept')
