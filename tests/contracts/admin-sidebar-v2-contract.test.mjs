import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { untranslate } from './i18n-source.mjs'

/*
 * Admin sidebar v2:
 * - Badges show only pending work (total user / announcement counts are not badges).
 * - Quick jump search is Turkish letter-insensitive, title matches first.
 * - The "pending work" strip goes to the urgent queue first.
 * - Ctrl/Cmd+K really focuses the search; no submenus (sections have their own tabs).
 */
const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
function load(path, mocks = {}) {
  const out = {}
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', code)((name) => { if (name in mocks) return mocks[name]; throw new Error(`beklenmeyen import: ${name}`) }, out)
  return out
}

const icons = new Proxy({}, { get: () => () => null })
const navModule = load('src/pages/admin/adminNavigation.ts', { 'lucide-react': icons })
const items = navModule.buildAdminNavItems({
  isReportsFeatureEnabled: false,
  isOperationsCenterEnabled: true,
  pendingCount: 12,
  seriesRequestPendingCount: 3,
  communityOpenReportCount: 5,
  legalRequestPendingCount: 2,
  reportPendingCount: 9,
  supportOpenCount: 4,
})
const byId = Object.fromEntries(items.map((item) => [item.id, item]))

for (const id of ['users', 'announcements', 'mangas', 'store']) {
  assert.equal(byId[id].badge, undefined, `${id}: a total count is not a badge`)
}
assert.equal(byId.pending.badge, 12)
assert.equal(byId.support.badge, 4)
assert.equal(byId.legal_requests.urgent, true, 'legal request urgent queue')
assert.equal(byId.reports.inactive, true, 'a section with its flag off is marked Off')
assert.equal(new Set(items.map((item) => item.id)).size, items.length, 'ids are unique')
for (const item of items) assert.ok(navModule.ADMIN_NAV_GROUP_ORDER.includes(item.group), `${item.id}: bilinen grup`)

// Search: "kullanici" -> title match Users first, Support (matching in description) later.
const results = navModule.filterAdminNavItems(items, 'KULLANICI')
assert.equal(results[0].id, 'users')
assert.ok(results.some((item) => item.id === 'support'), 'description matches are also in the list')
assert.equal(navModule.filterAdminNavItems(items, 'cev\u0131r\u0131')[0].id, 'translation_studio', 'accents and the dotless i difference are ignored')
assert.equal(navModule.filterAdminNavItems(items, '').length, items.length)

// Pending work strip: a closed section does not count, urgent queue first (reports closed -> legal).
assert.equal(navModule.pickBusiestQueue(items).id, 'legal_requests')
assert.equal(navModule.pickBusiestQueue(items.map((item) => ({ ...item, urgent: false }))).id, 'pending')
assert.equal(navModule.pickBusiestQueue(items.map((item) => ({ ...item, badge: 0 }))), null)

const sidebar = read('src/components/admin/shared/AdminSidebarNav.tsx')
assert.match(sidebar, /event\.key\.toLowerCase\(\) !== 'k'/, 'Ctrl/Cmd+K dinlenir')
assert.match(sidebar, /searchRef\.current\?\.focus\(\)/, 'the shortcut focuses search')
assert.match(sidebar, /data-testid="admin-nav-search"/)
assert.match(sidebar, /data-testid=\{`admin-nav-\$\{item\.id\}`\}/)
assert.match(sidebar, /aria-current=\{isActive \? 'page' : undefined\}/)
assert.doesNotMatch(sidebar, /ADMIN_SUB_NAV|CollapsibleTrigger/, 'no submenu')
assert.match(read('src/components/admin/shared/AdminPageShell.tsx'), /<Sidebar collapsible="icon"/, 'ikon moduna daralir')
assert.match(read('src/pages/AdminPage.tsx'), /supportOpenCount,/, 'support badge is wired')

console.log('PASS admin sidebar v2 (badge, search, urgent queue, shortcut)')
