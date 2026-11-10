/**
 * Manga control panel contract.
 *
 * The panel MOVED to the user management pattern. Protected decisions:
 *
 * 1. The summary comes from the SERVER, not the visible page. It used to sum the page with
 * `mangas.reduce`; with a 96-manga catalog showing a page of 20 it said
 * "Approved: 20": the number looked right but did not represent the catalog.
 * 2. View presets go to the SERVER QUERY. Filtering on the client would make
 * pagination and the total a lie.
 * 3. "Series with no chapters" is an ANTI-JOIN; `last_chapter_number` is NOT USED as a proxy
 * (measured: 3 mismatches in live data).
 * 4. Raw database errors do not leak to the user.
 * 5. Admin v2 desk layout (2026-11-03): summary strip = view presets
 * (from the server summary), paged list + selected series panel (on the right at desk size,
 * a Sheet on narrow screens), bulk action bar and a confirm dialog stating the result.
 * 6. PRODUCT MODEL: manga is a SHARED CATALOG, NO ownership. Any fansub can translate and
 * upload a manga's chapters; the permission key is
 * `chapters.fansub_id`, NOT `mangas.fansub_id`. So a "manga without a fansub"
 * is not a gap and is not shown as a warning/queue. The admin's real job is
 * reviewing uploaded chapters against the criteria.
 * 7. The detail window has a FIXED height and one scroll area;
 * it does not grow and shrink on tab change.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { untranslate } from './i18n-source.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relativePath) => untranslate(readFileSync(path.join(root, relativePath), 'utf8'))

/**
 * Yorumlari ayikla.
 *
 * "Bu desen KODDA olmamali" turu pinler yorum metnine takilmamali: kararin
 * nedenini anlatan aciklama, kararin ihlali degildir.
 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const overviewMigration = read('supabase/migrations/20260801190000_admin_manga_control_overview.sql')
const viewPageMigration = read('supabase/migrations/20260801220000_admin_manga_control_view_page.sql')
const types = read('src/services/adminService/types.ts')
const modal = read('src/components/admin/manga-control/MangaDetailControlModal.tsx')
const metricsMigration = read('supabase/migrations/20260802090000_admin_manga_detail_metrics.sql')
const metricsService = read('src/services/adminService/mangaControl.metrics.ts')
const sidebar = read('src/components/admin/manga-control/MangaDetailSidebar.tsx')
const chapterReview = read('src/components/admin/manga-control/MangaDetailChapterReview.tsx')
const metaPanel = read('src/components/admin/manga-control/MangaDetailMetaPanel.tsx')
const communityPanel = read('src/components/admin/manga-control/MangaDetailCommunityPanel.tsx')
const pageCountsMigration = read('supabase/migrations/20260802110000_admin_manga_chapter_page_counts.sql')
const grantsMigration = read('supabase/migrations/20260802140000_admin_manga_rpc_grants_fix.sql')
const overviewService = read('src/services/adminService/mangaControl.overview.ts')
const listService = read('src/services/adminService/mangaControl.list.ts')
const section = read('src/components/admin/MangaManagementSection.tsx')
const detailPane = read('src/components/admin/mangaManagement/MangaDetailPane.tsx')
const confirmDialog = read('src/components/admin/shared/AdminConfirmDialog.tsx')

// ---------- A) The summary comes from the server ----------
assert.match(overviewMigration, /create or replace function app_private\.get_admin_manga_control_overview/, 'the summary must be defined under app_private')
assert.match(overviewMigration, /security definer/i, 'the summary must be SECURITY DEFINER')
assert.match(overviewMigration, /set search_path to ''/, "search_path must be emptied (same pattern as users)")
assert.match(
  overviewMigration,
  /auth\.role\(\), ''\) <> 'service_role'[\s\S]{0,120}app_private\.is_admin/,
  'the summary must be protected by the admin/service_role gate',
)
assert.match(overviewMigration, /errcode = '42501'/, 'unauthorized access must be rejected with 42501')

// Metrics from the whole catalog: these must be calculated one by one on the server.
for (const key of ['withoutChapters', 'withoutFansub', 'incompleteMeta', 'chaptersPending', 'chaptersScheduled']) {
  assert.ok(overviewMigration.includes(`'${key}'`), `the summary must return the ${key} field`)
}

// Bolum sayimi manga basina toplanmaz; dogrudan chapters uzerinden yapilir.
assert.match(overviewMigration, /from public\.chapters as c;/, 'chapter metrics must be counted over chapters')

// ---------- B) Chapter summary is NO LONGER calculated from the page ----------
assert.doesNotMatch(
  stripComments(section),
  /mangas\.reduce/,
  'the summary must not be computed from the visible page (regression: a page total does not represent the catalog)',
)
assert.match(section, /getAdminMangaControlOverview/, 'the summary must come from the server function')
assert.match(section, /const value = overview \? view\.count\(overview\) : null/, 'the summary strip must show the server summary')

// ---------- C) View presets go to the server ----------
assert.match(listService, /const view = params\.view \|\| 'all'/, 'the view must be read in the server query')
assert.match(listService, /view === 'pending'\) query = query\.eq\('is_approved', false\)/, 'onay bekleyen sorguda filtrelenmeli')
assert.match(
  listService,
  /view === 'without-chapters' \|\| view === 'pending-chapters'/,
  'computed views must go to the server function',
)
assert.match(section, /view: activeView/, 'the selected view must pass to the list call')

// ---------- C2) PRODUCT MODEL: NO manga ownership ----------
// Manga is a shared catalog. `mangas.fansub_id` is only a trace of the team that opened the
// catalog record; empty is not a gap. Showing it as a warning/queue
// sends the admin to a problem that does not exist (this happened once).
const views = read('src/components/admin/mangaManagement/mangaControlViews.ts')
assert.doesNotMatch(stripComments(views), /'without-fansub'/, 'there must be no fansubless view (no ownership)')
assert.doesNotMatch(stripComments(types), /'without-fansub'/, 'there must be no fansubless view type')
assert.doesNotMatch(stripComments(section), /Fansubsuz|sahipsiz|withoutFansub/, 'no fansubless metric / warning must show')
assert.doesNotMatch(stripComments(detailPane), /Fansubu yok|sahipsiz/, 'the panel must have no fansubless warning')

// Instead the admin's real job: chapter criteria review.
assert.match(views, /id: 'pending-chapters'/, 'a chapter review queue view must exist')
assert.match(section, /id: 'pending-chapters', label: 'B\u00f6l\u00fcm incelemesi'/, 'the review queue must open from the summary strip')
assert.match(overviewMigration, /'pendingChapterSeries'/, 'the summary must give the count of series awaiting review')
assert.match(
  viewPageMigration,
  /v_view = 'pending-chapters'\s*\n?\s*and exists \(select 1 from public\.chapters as c where c\.manga_id = m\.id and not c\.is_approved\)/,
  'the review queue must select series with pending CHAPTERS',
)

// ---------- D) Bolumsuz seri: anti-join, proxy DEGIL ----------
assert.match(
  viewPageMigration,
  /not exists \(select 1 from public\.chapters as c where c\.manga_id = m\.id\)/,
  'a chapterless series must be found with a real anti-join',
)
assert.doesNotMatch(
  viewPageMigration.replace(/^\s*--.*$/gm, ''),
  /last_chapter_number/,
  'last_chapter_number must not be used as a proxy (measured: unreliable)',
)
// Pagination on the server: returning all ids would not fit the URL as the catalog grows.
assert.match(viewPageMigration, /limit greatest\(coalesce\(p_limit, 20\), 1\)/, 'pagination must be applied on the server')
assert.match(viewPageMigration, /'total',/, 'the total count must be returned separately so pagination is right')
assert.match(
  listService,
  /computedViewPage\s*\?\s*await query\s*:\s*await query\.range\(from, to\)/,
  'a range must not be applied twice to a server-paged view',
)
assert.match(listService, /order\.get\(left\.id\)/, 'server order must be rebuilt since `.in()` does not guarantee order')

// ---------- E) Raw database errors must not leak ----------
assert.match(listService, /function isAdminAccessError/, 'a permission error must be classified')
assert.match(listService, /admin yetkisi gerekiyor/, 'a permission error must become a clear sentence')
// The first version was `if (error) throw error` and raw Postgres text ("permission
// denied for function ...") was visible to the user in the table.
assert.doesNotMatch(
  stripComments(listService),
  /if \(error\) throw error/,
  'an RPC error must not be thrown unclassified',
)

// ---------- F) Admin v2 masa duzeni ----------
// Ayni secili-seri paneli masada sagda, dar ekranda Sheet'te kullanilir.
const paneUsages = section.match(/<MangaDetailPane(?![A-Za-z0-9_])/g) || []
assert.equal(paneUsages.length, 1, 'the selected series panel must be built in one place and shared between desk / Sheet')
assert.match(section, /useDeskLayout()/, 'shared desk breakpoint')
assert.match(section, /xl:grid-rows-\[minmax\(0,1fr\)\]/, 'the desk must fit screen height')
assert.match(section, /min-h-0 divide-y divide-border\/50 overflow-y-auto/, 'liste kendi icinde kaymali')
assert.match(section, /onOpenAutoFocus=\{focusSheetContainer\}/, 'drawer focus on narrow screens')
assert.match(section, /const MANGAS_PER_PAGE|MANGAS_PER_PAGE/, 'the list is paged')

assert.match(section, /window\.setInterval/, 'there must be a silent auto refresh')
assert.match(section, /document\.visibilityState !== 'visible'/, 'must not refresh while hidden')

// Bulk action: the bar should not render at all with no selection; partial success is reported.
assert.match(section, /\{selected\.length > 0 \? \(/, 'bos toplu islem cubugu yer kaplamamali')
assert.match(section, /Promise\.allSettled/, 'toplu islemde kismi basari ayri bildirilmeli')
assert.match(section, /data-testid="admin-manga-list"/, 'liste yuzeyi pinlenmeli')
assert.match(section, /label="Bu sayfadaki serilerin t\u00fcm\u00fcn\u00fc se\u00e7"/, 'there must be a select-all box')

// ---------- G) Dialogs ----------
// No native confirm; unpublishing / unapproving go through a dialog stating the result.
assert.doesNotMatch(section, /confirmDialog|window\.confirm/, 'yerli onay penceresi kullanilmamali')
assert.match(confirmDialog, /grid-cols-\[minmax\(0,1fr\)\]/, 'a long name must not overflow the window')
assert.match(confirmDialog, /line-clamp-2 \[overflow-wrap:anywhere\]/)
assert.match(section, /destructive: true,/, 'unpublishing must be marked destructive')

// ---------- H) Summary cells are queue shortcuts ----------
// There should be no step between seeing a count and reaching those records.
assert.match(section, /onClick=\{\(\) => setActiveView\(view\.id\)\}/, 'a summary cell must open its own view')
assert.match(section, /aria-pressed=\{active\}/, 'the selected cell state must be accessible')

// ---------- I) Service: cache and missing-RPC resilience ----------
assert.match(overviewService, /OVERVIEW_SNAPSHOT_TTL_MS/, 'the summary must stay in a short-lived cache')
assert.match(overviewService, /overviewInFlight/, 'concurrent requests must dedupe')
assert.match(overviewService, /isMissingRpcError/, 'with the RPC absent the panel must work without a summary')

// ---------- J) Detail window: workbench layout ----------
// The window was REWRITTEN FROM SCRATCH (a user said they were not happy at all).
// Protected decisions:

// 1) Yukseklik SABIT; sekme degisince pencere buyuyup kuculmez.
assert.doesNotMatch(stripComments(modal), /max-h-\[9?0?vh\]/, 'the window must not size by content')
assert.match(modal, /'flex h-\[min\(90vh,880px\)\] w-\[min\(96vw,1180px\)\]/, 'the window must have a fixed height')

// 2) PERSISTENT context on the left, work area on the right. Changing tabs you should still see
//    which series it is and what is broken.
assert.match(modal, /<MangaDetailSidebar/, 'there must be a persistent context rail')
assert.match(sidebar, /data-testid="admin-manga-detail-sidebar"/, 'ray pinlenmeli')
assert.match(sidebar, /data-testid="admin-manga-detail-warnings"/, 'warnings must be on the rail')
assert.match(sidebar, /lg:w-\[264px\]/, 'the rail must have a fixed width on desktop')

// 3) ONE scroll on mobile, two columns scroll separately on desktop. Two independent stacked
//    scrollers fight each other on a narrow screen.
assert.match(modal, /'overflow-y-auto lg:overflow-hidden'/, 'mobile must have a single scroll')
assert.match(sidebar, /lg:overflow-y-auto/, 'the rail must scroll inside only on desktop')
assert.doesNotMatch(
  stripComments(sidebar),
  /className="flex[^"]*\soverflow-y-auto/,
  'the rail must not open its own scroller on mobile',
)

// 4) Tabs are split by JOB, not data type. The old "General" tab was a junk drawer
//    holding metrics + three edit forms together.
assert.match(modal, /export type MangaDetailTab = 'chapters' \| 'meta' \| 'community'/, 'tabs must be split by job')
assert.doesNotMatch(stripComments(modal), /'overview'/, 'the junk drawer "Genel" tab must not come back')

// 5) Varsayilan sekme BOLUMLER: pencerenin acilma sebebi cogunlukla inceleme.
const hookSource = read('src/components/admin/mangaManagement/useMangaDetailControl.ts')
assert.match(hookSource, /setDetailTab\('chapters'\)/, 'the window must open with the chapter review')

// 6) Chapter review is a card list, not a TABLE: the old 7-column table scrolled horizontally
//    on narrow screens and was unreadable.
assert.match(chapterReview, /data-testid="admin-manga-chapter-review"/, 'inceleme yuzeyi pinlenmeli')
assert.doesNotMatch(stripComments(chapterReview), /<table/, 'the chapter review must not turn into a table')
assert.match(chapterReview, /<article/, 'each translation version must be a card')

// 7) Criteria review cannot happen WITHOUT SEEING pages.
assert.match(chapterReview, /buildPublicChapterPath\(\{/, 'each version must open in the reader')
assert.match(chapterReview, /forceVersionQuery: true/, 'the link must open EXACTLY that fansub version')
assert.match(
  chapterReview,
  /fansubSlug: chapter\.fansubId \? chapter\.fansubSlug : undefined/,
  'a chapter with no fansub must not produce an empty team key',
)
assert.match(chapterReview, /onlyPending/, 'there must be an awaiting review filter')

// 8) Page count is visible in review: a 2-page chapter is a half-finished upload.
assert.match(chapterReview, /chapterPageCounts\[chapter\.id\]/, 'page count per chapter must be shown')
assert.match(pageCountsMigration, /jsonb_array_length\(ch\.pages\)/, 'page count must be computed on the server')
assert.match(pageCountsMigration, /errcode = '42501'/, 'page count must be protected with the admin gate')

// 9) What must be read in moderation is the TEXT; it is not squeezed into a table.
assert.doesNotMatch(stripComments(communityPanel), /<table/, 'comment moderation must not turn into a table')
assert.match(communityPanel, /whitespace-pre-wrap break-words/, 'comment text must not be clipped')
assert.match(communityPanel, /comment\.isSpoiler/, 'spoiler comments must be marked (counted in metrics)')

// 10) Details editing on one surface; stacked gray boxes should not return.
assert.match(metaPanel, /data-testid="admin-manga-meta-panel"/, 'kunye yuzeyi pinlenmeli')
assert.doesNotMatch(stripComments(metaPanel), /bg-muted\/30/, 'ust uste yiginlanan gri kutular geri gelmemeli')
// No ownership: contributing teams are informational.
assert.match(metaPanel, /sahiplik de\u011fil/, 'translating teams must not be presented like ownership')

// ---------- K) Per-manga metrics ----------
// Admin surface: more than the list summary is gathered and it changes decisions.
assert.match(metricsMigration, /create or replace function app_private\.get_admin_manga_detail_metrics/, 'the metric function must be under app_private')
assert.match(metricsMigration, /security definer/i, 'metrics must be SECURITY DEFINER')
assert.match(metricsMigration, /set search_path to ''/, 'search_path bosaltilmali')
assert.match(metricsMigration, /errcode = '42501'/, 'unauthorized access must be rejected')

for (const key of ['readersTotal', 'lastChapterAt', 'avgChapterIntervalDays', 'emptyPageChapters', 'viewsCurrentMonth']) {
  assert.ok(metricsMigration.includes(`'${key}'`), `metrics must return the ${key} field`)
}

// Readers, not VIEWS: unique users must be counted.
assert.match(metricsMigration, /count\(distinct rh\.user_id\)/, 'readers must be counted as unique users')
// A chapter with no pages = a broken upload; must be caught before approval.
assert.match(metricsMigration, /jsonb_array_length\(c\.pages\) = 0/, 'a pageless chapter must be detected')

// The report count is deliberately absent (always returns 0, gives false confidence).
assert.doesNotMatch(
  metricsMigration.replace(/^\s*--.*$/gm, ''),
  /fansub_reported_content/,
  'no manga/chapter report metric must be added (the data type does not support it)',
)

// Without metrics the window must still work.
// Pin the BEHAVIOR, not the function name: which error codes are tolerated
// and whether null is returned instead of throwing on those.
for (const code of ['42501', '42883', 'PGRST202']) {
  assert.ok(metricsService.includes(`'${code}'`), `${code} must be tolerated (the window must work with no metrics)`)
}
assert.match(
  stripComments(metricsService),
  /if \(error\) \{[\s\S]{0,160}return null[\s\S]{0,80}throw error/,
  'a tolerated error must return null and not throw',
)
assert.match(sidebar, /Metrikler yuklenemedi/, 'metrik yokken anlasilir mesaj gosterilmeli')
assert.match(sidebar, /metrics\.avgChapterIntervalDays/, 'yayin temposu rayda gosterilmeli')

// The same numbers should not repeat: the old "Chapter Distribution" block is in metrics.
assert.doesNotMatch(stripComments(modal), /Bolum Dagilimi/, 'the duplicate chapter distribution block must not come back')

// ---------- L) app_private EXECUTE permission ----------
// `public.*` wrappers are NOT `security definer` (the permission check is inside the
// app_private function). Writing `revoke ... from public` without granting back to
// `authenticated` made all four RPCs "permission denied" for a REAL ADMIN;
// metrics showed "—" in the panel.
for (const fn of [
  'get_admin_manga_control_overview',
  'get_admin_manga_control_view_page',
  'get_admin_manga_detail_metrics',
  'get_admin_manga_chapter_page_counts',
]) {
  assert.ok(
    grantsMigration.includes(`grant execute on function app_private.${fn}(`),
    `app_private EXECUTE permission must be granted for ${fn} (otherwise even admins cannot call it)`,
  )
}
assert.match(grantsMigration, /to authenticated, service_role;/, 'the permission must be granted to the authenticated role')

// Each `revoke ... from public` must have a matching grant.
for (const migration of [overviewMigration, viewPageMigration, metricsMigration, pageCountsMigration]) {
  const revokes = (migration.match(/revoke all on function app_private\./g) || []).length
  if (revokes > 0) {
    assert.ok(
      /grant execute on function public\./.test(migration),
      'app_private revoke edilen migration public sarmalayiciyi grant etmeli',
    )
  }
}

// ---------- M) Window width ----------
// The shared DialogContent enforces `sm:max-w-lg` (512px). Writing only
// `max-w-none` is NOT ENOUGH: tailwind-merge treats prefixed and unprefixed classes as separate
// keys, and on `sm:` 512px wins, narrowing the window (measured).
assert.match(modal, /max-w-none sm:max-w-none/, 'max-w must also be reset at the sm breakpoint')
assert.match(modal, /w-\[min\(96vw,1180px\)\]/, 'window width must be measured against the screen')

console.log('PASS admin manga control contract verified')
