import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JUNK_PATTERNS, TARGET_TABLES } from '../../scripts/audit-suspicious-content.mjs'
import { untranslate } from './i18n-source.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relativePath) => untranslate(readFileSync(path.join(root, relativePath), 'utf8'))

const section = read('src/components/admin/sections/AdminReportsSection.tsx')
const detail = read('src/components/admin/reports/ReportDetailPanel.tsx')
const filters = read('src/components/admin/reports/ReportFilters.tsx')
const table = read('src/components/admin/reports/ReportQueueTable.tsx')
const insights = read('src/components/admin/reports/ReportInsights.tsx')
const actions = read('src/services/reportService/actions.ts')
const e2e = read('src/testing/adminReportsE2e.ts')

for (const file of [section, detail, filters, table, insights, actions, e2e]) {
  assert.ok(file.split(/\r?\n/).length < 750, 'report management files must stay under 750 lines')
}

assert.match(section, /ReportStatCards/, 'the five-part operations summary must be kept')
assert.match(section, /ReportQueueTable/, 'the main report queue must be kept')
assert.match(section, /ReportDetailPanel/, 'the selected report detail must be kept')
assert.match(section, /ReportInsights/, 'queue, risk and trend panels must be kept')
assert.match(section, /min-width: 1480px/, 'the desktop master-detail breakpoint must be kept')
assert.match(section, /SheetContent/, 'on narrow screens detail must open in a Sheet')
assert.match(section, /ReportReviewModal/, 'advanced moderation must stay in a separate detail window')

assert.match(filters, /Raporlarda ara/, 'the report search field must carry an accessible label')
assert.match(table, /onSelectReport/, 'a table row must update the selected report area')
assert.match(detail, /addReportModerationNote/, 'the moderator note must be tied to the real service flow')
assert.match(detail, /Hedefe Git/, 'the target content link must be kept')
assert.match(insights, /DashboardTrendChart/, 'the seven-day trend must use the interactive shared chart')

for (const label of [
  'Rapor kuyruğu',
  'Rapor durumu güncelleme',
  'Rapor moderasyon geçmişi',
  'Rapor moderasyon notu',
]) {
  assert.match(actions, new RegExp(`label: '${label}'`), `${label} must be within the timeout limit`)
}
assert.match(actions, /reportNoteSchema = z\.string\(\)\.trim\(\)\.min\(3\)\.max\(500\)/)
assert.match(actions, /create_admin_audit_log/, 'moderator notes must be written via the audit chain')
assert.match(actions, /tryWriteAdminAuditLog/, 'status decisions must produce an audit trail')
assert.match(e2e, /isE2EModeEnabled/, 'the visual fixture must run only in controlled E2E mode')

const matchesJunk = (value) => JUNK_PATTERNS.some((pattern) => pattern.test(value))
assert.equal(matchesJunk('deneme'), true)
assert.equal(matchesJunk('qwe'), true)
assert.equal(matchesJunk('denemeleri'), false)
assert.equal(matchesJunk('balkabağı'), false)
assert.equal(matchesJunk('boyasıçramalı'), false)
assert.ok(TARGET_TABLES.includes('user_manga_lists'))
assert.ok(!TARGET_TABLES.includes('lists'))

console.log('PASS admin report management and content cleanup contract kept')

// Admin v2: summary as a strip in one card (not large cards), filters wrap and text is not cut.
const statCards = read('src/components/admin/reports/ReportStatCards.tsx')
assert.match(statCards, /grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 \[&>\*\]:border-b/, 'summary strip')
assert.doesNotMatch(statCards, /min-h-\[126px\]/, 'no big card')
assert.match(filters, /flex flex-wrap items-center gap-2/, 'filtreler sarmalanir')
assert.match(filters, /aria-label="Filtreleri temizle"/)
assert.match(section, /title="Raporlar"/)
console.log('PASS admin reports v2 layout')
