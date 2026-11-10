/**
 * List management contract (Admin v2, 2026-11-01: list desk).
 *
 * Protected decisions:
 *
 * 1. The summary comes from the SERVER, not the visible page. The old panel summed
 * 12 records per page; with 23 lists "Public" showed ~9 instead of 18.
 * 2. Denormalized counters are NOT TRUSTED. `user_manga_lists.comments_count` was
 * measured and disagrees with the real count on 1 live row; the summary counts from source
 * tables and reports the drift separately (also written on the desk).
 * 3. View presets go to the SERVER QUERY. Filtering on the client would make
 * pagination and the total a lie.
 * 4. An `app_private` EXECUTE grant is required: the `public.*` wrapper is not security
 * definer, the call proceeds with the caller's rights (lesson from PR #86).
 * 5. Details: persistent context (identity, counts, gaps) + tabs by job
 * (Manga default / Info / Comments). In v2 a desk (list + details) replaces a separate
 * window and a rail visible only at 1640px.
 * 6. The comment body is NOT printed RAW: spoilers and supporter tokens render with the shared
 * preview component.
 * 7. v2: removing a list comment is the same flow as the Comments page (reason +
 * author notification + audit record); there used to be unnotified hiding and permanent
 * deletion. List deletion only through a confirm dialog ("make private instead").
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { untranslate } from './i18n-source.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relativePath) => untranslate(readFileSync(path.join(root, relativePath), 'utf8'))

/** "Bu desen kodda olmamali" pinleri yorum metnine takilmamali. */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const migration = read('supabase/migrations/20260802160000_admin_list_control_overview.sql')
const overviewService = read('src/services/adminMangaListService/overview.ts')
const listQueries = read('src/services/adminMangaListService/queries.ts')
const section = read('src/components/admin/AdminMangaListsSection.tsx')
const views = read('src/components/admin/mangaLists/listControlViews.ts')
const pane = read('src/components/admin/mangaLists/ListDetailPane.tsx')
const itemsPanel = read('src/components/admin/mangaLists/ListDetailItemsPanel.tsx')
const commentsPanel = read('src/components/admin/mangaLists/ListDetailCommentsPanel.tsx')
const deleteDialog = read('src/components/admin/mangaLists/ListDeleteDialog.tsx')

// ---------- A) Sunucu ozeti ----------
assert.match(migration, /create or replace function app_private\.get_admin_list_control_overview/, 'the summary must be under app_private')
assert.match(migration, /security definer/i, 'the summary must be SECURITY DEFINER')
assert.match(migration, /set search_path to ''/, 'search_path bosaltilmali')
assert.match(
  migration,
  /auth\.role\(\), ''\) <> 'service_role'[\s\S]{0,120}app_private\.is_admin/,
  'the summary must be protected by the admin/service_role gate',
)
assert.match(migration, /errcode = '42501'/, 'unauthorized access must be rejected with 42501')

for (const key of ['emptyLists', 'withoutCover', 'listsWithInactiveComments', 'counterDrift']) {
  assert.ok(migration.includes(`'${key}'`), `the summary must return the ${key} field`)
}

// ---------- B) Denormalize sayaclara guvenilmez ----------
// Bos liste GERCEK ogelerden bulunur; `items_count` sayaci kayabilir.
assert.match(
  migration,
  /not exists \(select 1 from public\.user_manga_list_items as i where i\.list_id = l\.id\)/,
  'an empty list must be found with a real anti-join',
)
assert.doesNotMatch(
  stripComments(migration).split("'counterDrift'")[0],
  /filter \(where l\.items_count = 0\)/,
  'bos liste denormalize sayacla belirlenmemeli',
)
assert.match(migration, /l\.comments_count <> \(select pg_catalog\.count\(\*\)/, 'sayac kaymasi raporlanmali')

// ---------- C) app_private EXECUTE grant ----------
// If forgotten the RPC gives "permission denied" even for a real admin.
for (const fn of ['get_admin_list_control_overview', 'get_admin_list_control_view_page']) {
  assert.ok(
    migration.includes(`grant execute on function app_private.${fn}(`),
    `app_private EXECUTE permission must be granted for ${fn}`,
  )
}
assert.match(migration, /to authenticated, service_role;/, 'the permission must be granted to the authenticated role')

// ---------- D) Views go to the server ----------
assert.match(listQueries, /const view = params\.view \|\| 'all'/, 'the view must be read in the server query')
assert.match(
  listQueries,
  /view === 'empty' \|\| view === 'moderation'/,
  'computed views must go to the server function',
)
assert.match(listQueries, /view === 'without-cover'\) query = query\.is\('cover_manga_id', null\)/, 'kapaksiz sorguda filtrelenmeli')
assert.match(section, /view: activeView/, 'the selected view must pass to the list call')
assert.match(listQueries, /order\.get\(left\.id\)/, 'server order must be rebuilt since `.in()` does not guarantee order')

// ---------- E) The summary is no longer calculated from the page ----------
assert.doesNotMatch(stripComments(section), /lists\.filter\(\(l\) => l\.isPublic\)/, 'the summary must not be computed from the visible page')
assert.match(section, /getAdminListControlOverview/, 'the summary must come from the server function')
assert.match(section, /data-testid="admin-lists-metrics"/, 'the summary strip must be pinned')
assert.match(section, /onClick=\{\(\) => setActiveView\(view\.id\)\}/, 'a strip cell must open its own view')
assert.match(section, /overview\.counterDrift > 0/, 'counter drift must be written on the desk too')

// ---------- F) Masa duzeni (liste + ayrinti) ----------
for (const removed of [
  'ListControlTableCard', 'ListControlInsightsPanel', 'AdminMangaListDetailModal', 'ListDetailSidebar',
  'ListControlMetricGrid', 'ListControlFiltersCard', 'ListControlBulkToolbar',
]) {
  assert.equal(existsSync(path.join(root, `src/components/admin/mangaLists/${removed}.tsx`)), false, `${removed} moved to the desk`)
}
assert.match(section, /data-testid="admin-lists-workspace"/, 'the desk surface must be pinned')
assert.match(section, /flex flex-col gap-4 xl:min-h-0 xl:flex-1/)
assert.match(section, /xl:grid-rows-\[minmax\(0,1fr\)\]/)
assert.match(section, /min-h-0 divide-y divide-border\/50 overflow-y-auto/, 'liste kendi icinde kayar')
assert.match(section, /data-testid="admin-lists-list"/, 'liste yuzeyi pinlenmeli')
assert.ok(section.includes('aria-label="Bu sayfadaki listelerin t\u00fcm\u00fcn\u00fc se\u00e7"'), 'there must be a select-all box')
assert.match(section, /onOpenAutoFocus=\{focusSheetContainer\}/, 'a drawer on narrow screens; the info card does not open by itself')
assert.match(section, /window\.setInterval/, 'there must be a silent auto refresh')
assert.match(section, /document\.visibilityState !== 'visible'/, 'must not refresh while hidden')
assert.match(section, /selectedIdRef\.current !== listId/, 'a late old detail must not overwrite the new selection')

// ---------- G) Details: persistent context + tabs by job ----------
assert.match(pane, /export type ListDetailTab = 'items' \| 'meta' \| 'comments'/, 'tabs must be split by job')
assert.doesNotMatch(stripComments(pane), /'overview'/, 'the junk drawer "Genel" tab must not come back')
assert.match(section, /useState<ListDetailTab>\('items'\)/, 'ayrinti liste icerigiyle acilmali')
assert.match(pane, /data-testid="admin-list-detail-warnings"/, 'eksikler kalici baglamda')
assert.match(pane, /<AdminEntityHoverCard kind="user" entityKey=\{list\.ownerId \|\| null\}>/, 'info card on the owner')
// An inactive/unapproved manga shows as a gap on a public list.
assert.match(itemsPanel, /!item\.mangaIsActive \|\| !item\.mangaIsApproved/, 'yayinda olmayan ogeler isaretlenmeli')

// ---------- G2) Kararlar: ortak yorum akisi, onayli silme ----------
assert.match(section, /setAdminModerationCommentsActive\(\[toModerationItem\(comment, detail\)\], isActive, reason\)/, 'a list comment must go through the Comments flow')
assert.match(section, /<CommentRemoveDialog/, 'removal goes through a window with a reason')
assert.doesNotMatch(section, /deleteAdminMangaListComment|confirmDialog/, 'comments are not permanently deleted; no generic confirm box')
assert.ok(deleteDialog.includes('Bunun yerine \u00f6zele al'), 'silme yerine ozele alma secenegi')
assert.ok(deleteDialog.includes('Sahibine bildirim gitmez'), 'the delete result is explicit')

// ---------- H) The comment body is not printed raw ----------
// The body can contain spoiler markers and supporter tokens.
assert.match(commentsPanel, /AdminCommentBodyPreview/, 'the comment body must render with the shared preview')
// Passing as a prop is allowed (`text={comment.body}`); printing it as a JSX text
// child (`>{comment.body}<`) is FORBIDDEN.
assert.doesNotMatch(
  stripComments(commentsPanel).replace(/\s+/g, ''),
  />\{comment\.body\}</,
  'the comment body must not print as plain text',
)

// ---------- I) Servis dayanikliligi ----------
for (const code of ['42501', '42883', 'PGRST202']) {
  assert.ok(overviewService.includes(`'${code}'`), `${code} must be tolerated (the panel must work with no summary)`)
}
assert.match(overviewService, /OVERVIEW_TTL_MS/, 'the summary must stay in a short-lived cache')
assert.match(overviewService, /overviewInFlight/, 'concurrent requests must dedupe')
// Raw Postgres text should not leak to the user.
assert.match(overviewService, /admin yetkisi gerekiyor/, 'a permission error must become a clear sentence')

// ---------- J) View presets ----------
assert.match(views, /id: 'empty'/, 'there must be an empty list view')
assert.match(views, /id: 'moderation'/, 'there must be a moderation view')

console.log('PASS admin list management contract verified')
