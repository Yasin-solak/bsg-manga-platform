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

const dashboard = readSource('src/components/admin/AdminDashboardSection.tsx')
const header = readSource('src/components/admin/dashboard/DashboardHeader.tsx')
const metricCard = readSource('src/components/admin/dashboard/DashboardMetricCard.tsx')
const model = readSource('src/components/admin/dashboard/dashboardModel.ts')
const operations = readSource('src/components/admin/dashboard/DashboardOperationsCenter.tsx')
const trendChart = readSource('src/components/admin/dashboard/DashboardTrendChart.tsx')
const healthPanel = readSource('src/components/admin/dashboard/DashboardHealthPanel.tsx')
const dashboardHook = readSource('src/pages/admin/useAdminDashboardSnapshot.ts')
const adminPage = readSource('src/pages/AdminPage.tsx')

assert.match(dashboard, /useState<DashboardMetricId>\('backlog'\)/)
assert.match(dashboard, /onPeriodChange=\{onPeriodChange\}/)
assert.match(dashboard, /onSelectMetric=\{setSelectedMetricId\}/)
assert.match(dashboard, /DashboardTrendPanel metric=\{selectedMetric\}/)
assert.match(dashboard, /snapshot\?\.period\.key === period/)
assert.match(dashboard, /activeSnapshot \? applyDashboardSnapshot/)
assert.doesNotMatch(dashboard, /Hizli Islemler|Hızlı İşlemler|Quick Actions/i)

assert.match(header, /aria-label="Dashboard dönem filtresi"/)
assert.match(header, /aria-pressed=\{selected\}/)
assert.match(header, /onClick=\{\(\) => onPeriodChange\?\.\(entry\.value\)\}/)
assert.match(header, /aria-busy=\{isRefreshing\}/)

assert.match(metricCard, /aria-pressed=\{selected\}/)
assert.match(metricCard, /aria-controls="dashboard-trend-panel"/)
assert.match(metricCard, /data-testid=\{`dashboard-metric-detail-/)
assert.match(metricCard, /onClick=\{\(\) => onSelect\(metric\.id\)\}/)
assert.doesNotMatch(metricCard, /aria-label=\{`\$\{metric\.label\} metriğini grafikte göster`\}/)
assert.match(metricCard, /metric\.comparison\?\.deltaFormat === 'points'/)
assert.match(metricCard, /metric\.comparison\.description/)
assert.match(metricCard, /comparisonDirectionLabel\(metric\)/)
assert.match(metricCard, /className="sr-only">\{comparisonDirectionLabel\(metric\)\}/)

// Eski gonderi kuyrugu kalkti; topluluk kuyrugu (mesaj sikayetleri) ozet RPC'sinden gelir.
assert.match(model, /const approvalItems = params\.pendingItems\n/)
assert.match(model, /const backlogTotal = approvalCount \+ reportCount \+ legalCount/)
assert.match(model, /label: 'Topluluk \u015fik\u00e2yetleri'/)
assert.match(model, /const moderationCompletion = null/)
assert.doesNotMatch(model, /communityStats/)
assert.match(model, /kind: 'operations'/)
assert.match(model, /deltaFormat: usesPoints \? 'points' : 'percent'/)
assert.match(model, /availableMetricCount: snapshot\.operationHealth\.availableMetricCount/)
assert.doesNotMatch(model, /API.*Sağlıklı|Veritabanı.*Sağlıklı|Depolama.*Sağlıklı/)

assert.match(operations, /if \(queue\.status\)/)
assert.match(operations, /queue\.status\.percent/)
assert.doesNotMatch(operations, /Math\.max\(\.\.\.queues|pendingCount\s*\/\s*max/i)

assert.match(trendChart, /event\.key === 'ArrowLeft'/)
assert.match(trendChart, /event\.key === 'ArrowRight'/)
// The accessible data table stays hidden but in an sr-only WRAPPER: a table ignores height:1px;
// applied to the table, the page grew and the admin sidebar was pushed up on scroll.
assert.match(trendChart, /<div className="sr-only">\s*<table id=\{tableId\}>/)
assert.doesNotMatch(trendChart, /<table[^>]*className="sr-only"/)
assert.match(trendChart, /aria-live="polite"/)

assert.match(healthPanel, /health\.status === 'partial'/)
assert.match(healthPanel, /health\.availableMetricCount\}\/\{health\.totalMetricCount/)

assert.match(dashboardHook, /useEffect\(\(\) => \{[\s\S]*?activeRef\.current = isActive[\s\S]*?\}, \[isActive\]\)/)

assert.match(adminPage, /useAdminDashboardSnapshot\(activeSection === 'dashboard'\)/)
assert.match(adminPage, /onRefresh=\{dashboardSnapshot\.onRefresh\}/)
assert.doesNotMatch(adminPage, /<AdminDashboardSection[\s\S]{0,1200}onRefresh=\{\(\) => \{[\s\S]*?loadData/)

console.log('PASS admin dashboard interaction and honest metrics contract kept')

// Admin v2 "Genel bakis": kompakt serit, tekrarsiz saglik paneli, tiklanabilir kuyruk satiri.
const grid = readSource('src/components/admin/dashboard/DashboardMetricGrid.tsx')
assert.match(grid, /grid-cols-2 md:grid-cols-3 2xl:grid-cols-6/, 'metrics in one strip card (not big boxes)')
assert.match(header, /Genel bakış/, 'baslik Turkce')
assert.doesNotMatch(dashboard, /DashboardQualityPanel/, 'quality rates in the health panel; no second copy')
assert.equal(existsSync(path.join(rootDir, 'src/components/admin/dashboard/DashboardQualityPanel.tsx')), false)
assert.match(operations, /data-testid=\{`dashboard-queue-open-\$\{queue\.id\}`\}[\s\S]{0,120}onClick=\{\(\) => onNavigate\(queue\.target\)\}/, 'a queue row goes to its section')
assert.match(model, /title: request\.subject\?\.trim\(\) \|\| 'Yeni yasal talep'/, 'a legal request with an empty subject does not show titleless')
console.log('PASS admin overview v2 layout')
