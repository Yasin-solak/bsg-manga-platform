import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
import { untranslate } from './i18n-source.mjs'

/*
 * Admin > Announcements v2 (2026-11-01): announcement desk.
 * - The old list filtered only by raw status: expired / scheduled posts mixed under
 * "Live / scheduled" (10 of 12 live posts had expired), and there were no status counts
 * or search. The new query calculates status.
 * - Desk: strip = view, paged list, details (reader's preview,
 * engagement, settings); editing in a large editor window.
 * - The unsaved changes warning uses a dialog (not the browser's native confirm);
 * a shared select component replaces native dropdowns.
 */
const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
function load(path, mocks = {}) {
  const out = {}
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', code)((name) => { if (name === '@/i18n/activeLocale') return { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) }; if (name in mocks) return mocks[name]; throw new Error(`beklenmeyen import: ${name}`) }, out)
  return out
}

const migration = read('supabase/migrations/20261101150000_announcement_admin_overview.sql')
assert.match(migration, /perform announcement_internal\.require_admin\(\);/, 'admin only')
assert.match(migration, /v_state not in \('all', 'live', 'scheduled', 'ended', 'draft', 'archived', 'deleted'\)/)
assert.match(migration, /when e\.ends_at is not null and e\.ends_at <= now\(\) then 'ended'/, 'sona eren yayin ayri')
assert.match(migration, /when e\.starts_at > now\(\) then 'scheduled'/, 'planlanan ayri')
assert.match(migration, /revoke all on function public\.announcement_admin_overview\(text, text, integer\) from public, anon;/)
assert.match(migration, /grant execute on function announcement_internal\.admin_overview\(text, text, integer\) to authenticated;/, 'internal function permission (the wrapper is not security definer)')

const service = read('src/services/announcementV2/index.ts')
assert.match(service, /rpc\('announcement_admin_overview', \{ p_state: state, p_query: query\.trim\(\)\.slice\(0, 80\), p_offset: offset \}/)

for (const removed of ['AnnouncementAdminTable', 'AnnouncementQuickActions']) {
  assert.equal(existsSync(new URL(`../../src/components/admin/announcements/${removed}.tsx`, import.meta.url)), false, `${removed} moved to the desk`)
}

const manager = read('src/components/admin/announcements/AnnouncementManager.tsx')
assert.match(manager, /listAdminAnnouncementOverview\(state, query, offset, controller\.signal\)/)
for (const id of ['all', 'live', 'scheduled', 'ended', 'draft', 'archived', 'deleted']) {
  assert.match(manager, new RegExp(`\\{ id: '${id}', label: `), `view: ${id}`)
}
assert.match(manager, /flex flex-col gap-4 xl:min-h-0 xl:flex-1/)
assert.match(manager, /xl:grid-rows-\[minmax\(0,1fr\)\]/)
assert.match(manager, /min-h-0 divide-y divide-border\/50 overflow-y-auto/)
assert.match(manager, /onOpenAutoFocus=\{focusSheetContainer\}/)
assert.match(manager, /data-testid="admin-announcements-delete-dialog"/, 'cop kutusu onay penceresi')
assert.match(manager, /<AnnouncementDetailPane/)

const pane = read('src/components/admin/announcements/AnnouncementDetailPane.tsx')
assert.match(pane, /<AnnouncementContent announcement=\{item\.preview\} preview \/>/, 'the preview the reader sees')
assert.match(pane, /data-testid="admin-announcements-metrics"/)
assert.match(pane, /onTransition\('published'\)/)

const editor = read('src/components/admin/announcements/AnnouncementEditor.tsx')
assert.doesNotMatch(editor, /window\.confirm/, 'no native confirm box')
assert.ok(editor.includes('Kaydedilmemi\u015f de\u011fi\u015fiklikler var'), 'warning window')
const adminDir = new URL('../../src/components/admin/announcements/', import.meta.url)
for (const file of readdirSync(adminDir).filter((name) => name.endsWith('.tsx'))) {
  assert.doesNotMatch(read(`src/components/admin/announcements/${file}`), /<select[\s>]/, `${file}: no native dropdown`)
}

// Row status follows the same rules as the server.
const { announcementStateOf } = load('src/components/admin/announcements/announcementAdminUtils.ts', { 'lucide-react': {} })
const now = Date.parse('2026-11-01T12:00:00Z')
const base = { deleted_at: null, status: 'published', starts_at: '2026-10-01T00:00:00Z', ends_at: null }
assert.equal(announcementStateOf(base, now), 'live')
assert.equal(announcementStateOf({ ...base, ends_at: '2026-10-20T00:00:00Z' }, now), 'ended')
assert.equal(announcementStateOf({ ...base, starts_at: '2026-11-05T00:00:00Z' }, now), 'scheduled')
assert.equal(announcementStateOf({ ...base, status: 'draft' }, now), 'draft')
assert.equal(announcementStateOf({ ...base, deleted_at: '2026-10-30T00:00:00Z' }, now), 'deleted')

console.log('PASS admin announcements v2 contract')
