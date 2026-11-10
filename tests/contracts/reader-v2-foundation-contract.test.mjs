/**
 * Reader v2 foundation contract (Phase 0).
 *
 * Two things are protected:
 * A) The v1 reader in RESERVE: its routes, page and controller stay in place.
 * Prevents accidentally deleting/breaking v1 while developing v2.
 * B) v2's founding principles: the /oku route, ONE scroll container, its own full-screen
 * shell (Layout chrome exception), a separate data layer.
 *
 * Plan: docs/okuyucu-v2-gelistirme-plani-2026-07-29.md
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

// ---------- A) v1 yedekte kalmali ----------
for (const legacyPath of [
  'src/pages/MangaReaderPage.tsx',
  'src/pages/mangaReader/useReaderViewportController.ts',
  'src/pages/mangaReader/readerAutoScrollEngine.ts',
]) {
  assert.ok(existsSync(path.join(rootDir, legacyPath)), `A v1 reader file must not be deleted: ${legacyPath}`)
}

const appSource = read('src/App.tsx')
assert.match(
  appSource,
  /path='manga\/:id\/bolum\/:chapterNumber' element=\{<MangaReaderPage \/>\}/,
  'the v1 reader route must stay in place (reserve)',
)

// ---------- B) v2 kurucu ilkeleri ----------
const routeSource = read('src/lib/readerV2Route.ts')
assert.match(routeSource, /READER_V2_ROUTE_PREFIX = '\/oku'/)
assert.match(routeSource, /export function buildReaderV2Path/)
assert.match(routeSource, /export function parseReaderV2Params/)

assert.match(appSource, /path='oku\/:mangaKey\/:chapterNumber'/, 'the v2 route must be defined')
assert.match(appSource, /path='oku\/:mangaKey\/:chapterNumber\/:fansubKey'/, 'the fansub version route must be defined')

// Okuyucu kendi kabugunu kurar: app sidebar/topbar icinde render EDILMEMELI.
const layoutSource = read('src/components/layout/Layout.tsx')
assert.match(
  layoutSource,
  /location\.pathname\.startsWith\('\/oku\/'\)/,
  'the v2 reader must be added to the Layout chrome exception (otherwise it squeezes inside the sidebar)',
)

// ONE scroll container: v1's two-container fork should not move to v2.
//
// What the guard protects is the READING SURFACE being one container, not "the file has one
// overflow". The chapter end sequence came in Phase 4: in page mode the horizontal pager's LAST SCREEN
// is a vertical document (credit + support + comments do not fit one screen)
// and scrolls vertically inside. This is not a second reading container but a child of the
// one container. The guard was updated to measure this distinction explicitly.
const pageSource = read('src/pages/reader/ReaderV2Page.tsx')
const stageContentSource = read('src/pages/reader/ReaderV2StageContent.tsx')
assert.match(pageSource, /data-testid="reader-v2-stage"/)
assert.match(pageSource, /<ReaderV2StageContent/, 'single stage content must come from the dedicated component')
assert.equal(
  (pageSource.match(/data-testid="reader-v2-stage"/g) || []).length,
  1,
  'there must be one stage: no second container by mode',
)
assert.equal(
  (pageSource.match(/'flex overflow-x-auto overflow-y-hidden'/g) || []).length,
  1,
  'the reading container axis condition must be in one place: the root of v1 bugs was two containers',
)
assert.equal(
  (pageSource.match(/overflow-y-auto/g) || []).length
    + (stageContentSource.match(/overflow-y-auto/g) || []).length,
  2,
  'nothing scrolls other than the stage + chapter end panel',
)
assert.equal(
  (stageContentSource.match(/snap-center overflow-y-auto/g) || []).length,
  1,
  'the second scroller can ONLY be the chapter end panel',
)

// Separate data layer: the page component should not call data services directly.
const dataSource = read('src/pages/reader/useReaderV2Chapter.ts')
assert.match(dataSource, /getChapterDetails/)
assert.match(dataSource, /getChaptersByMangaId/)
assert.match(dataSource, /getMangaByIdentifier/)
assert.doesNotMatch(
  pageSource,
  /from '@\/services\/mangaService'/,
  'the page component must not fetch data directly (data layer useReaderV2Chapter)',
)

// Yeni RPC yazilmadi: mevcut sinanmis servisler yeniden kullanildi.
assert.doesNotMatch(dataSource, /supabase\.rpc\(/, 'the v2 data layer must not add a new RPC (existing services are reused)')

// ---------- C) Phase 1: layout engine wiring ----------
// The layout decision must be made in ONE place (a pure engine); the component only applies it.
// v1's root problem was scattering the decision over two JSX trees.
assert.match(pageSource, /useReaderV2Layout/, 'page layout must come from the engine layer')
assert.match(pageSource, /computeReaderV2Progress/, 'progress must be computed by the engine function')
assert.match(
  pageSource,
  /data-reader-axis=\{layout\.axis\}/,
  'kaydirma ekseni motorun kararindan gelmeli (elle sabitlenmemeli)',
)
assert.doesNotMatch(
  pageSource,
  /isHorizontalPagedMode/,
  'v1\'in mod bayragi v2\'ye tasinmamali: karar motorda',
)

const layoutHookSource = read('src/pages/reader/useReaderV2Layout.ts')
assert.match(layoutHookSource, /resolveReaderV2Layout/, 'hook karari motora delege etmeli')
assert.doesNotMatch(
  layoutHookSource,
  /aspect >|> READER_V2_STRIP_ASPECT_THRESHOLD/,
  'the threshold decision must be in the engine, not the hook (testability)',
)

console.log('PASS reader v2 foundation contract kept (v1 in reserve + v2 founding principles + layout engine)')
