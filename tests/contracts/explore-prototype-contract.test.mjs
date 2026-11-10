/**
 * Explore screen: prototype layout (Phase 1).
 *
 * The user shared the prototype's Explore screen VISUALLY (it is not in the file, it is on the
 * live canvas). The protected layout, from those visuals:
 *
 * Title + series count
 * Search box + a filter button on its RIGHT (opens a bottom sheet)
 * FOR YOU (horizontal rail, cards with reasons)
 * CATALOG (sort tabs + grid)
 *
 * Protected intent:
 * 1. The filter is a separate BUTTON and BOTTOM SHEET, not a chip strip across the page.
 * 2. On the card, badge + rating/chapter over the cover, the reason below.
 * 3. Reasons and badges are NOT INVENTED.
 * 4. The catalog is on the first screen; editorial blocks below.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { untranslate } from './i18n-source.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const CR = String.fromCharCode(13)

function read(relativePath) {
  return untranslate(readFileSync(path.join(rootDir, relativePath), 'utf8')).split(CR).join('')
}

const page = [read('src/pages/ExplorePage.tsx'), read('src/pages/explore/useExploreData.ts'), read('src/pages/explore/ExploreDesktopView.tsx')].join('\n')
const card = read('src/pages/explore/ExploreSeriesCard.tsx')
const filterSheet = read('src/pages/explore/ExploreFilterSheet.tsx')
const rail = read('src/pages/explore/ExploreForYouRail.tsx')

// ---------- A) Ust blok: baslik, sayi, arama, filtre dugmesi ----------
{
  assert.match(page, /<h1 className="m-0 text-\[28px\] font-black/, 'the screen name must stand as the title')
  assert.match(page, /data-testid="explore-total"/, 'katalogun buyuklugu yazilmali')
  assert.match(page, /data-testid="explore-filter-trigger"/, 'the filter must be a SEPARATE button')
  assert.match(
    page,
    /onClick=\{\(\) => setFilterSheetOpen\(true\)\}/,
    'the filter button must open the bottom sheet',
  )
  assert.match(
    page,
    /activeFilterCount > 0 \? \(/,
    'the active filter count must show on the button',
  )
}

// ---------- B) Filter is a BOTTOM SHEET, not a chip strip ----------
{
  assert.match(filterSheet, /<BottomSheet/, 'the shared bottom sheet shell must be used')
  assert.match(filterSheet, /data-testid="explore-filter-reset"/, 'there must be a Reset')
  assert.match(filterSheet, /data-testid="explore-filter-apply"/)
  assert.match(
    filterSheet,
    /Sonuçları göster \(\{resultCount\}\)/,
    'the button must say how many results will come',
  )
  assert.match(filterSheet, /aria-pressed=\{selected\}/)

  assert.doesNotMatch(
    page,
    /<ExploreToolbar/,
    'the old chip strip must not come back: it sat 6.7 screens down on phones',
  )
  assert.doesNotMatch(page, /<ExploreGenreSheet/, 'the separate genre panel was gathered in the filter sheet')
}

// ---------- C) Card: badge + rating/chapter + reason ----------
{
  assert.match(card, /data-testid="explore-card-badge"/)
  assert.match(card, /data-testid="explore-card-reason"/)
  assert.match(card, /rounded-\[14px\]/, 'cover with the radius of the prototype')
  assert.match(
    card,
    /variant === 'rail' && 'w-\[150px\] shrink-0'/,
    'rail cards must have a fixed width',
  )
  /*
   * NOT "N chapters" but "Ch. N": our field is the LAST chapter number
   * (`last_chapter_number`), not a total. We do not write as if it were a total.
   */
  assert.match(card, /\{manga\.lastChapter\}/)
  assert.doesNotMatch(card, /bölüm`/, 'no total chapter count claim')

  // The badge derives from real fields; no invented "trend".
  assert.match(card, /if \(manga\.isNew\) return 'new'/)
  assert.match(card, /if \(manga\.status === 'completed'\) return 'completed'/)
  assert.match(
    card,
    /if \(\(manga\.views \|\| 0\) >= \d+\) return 'rising'/,
    'the trending badge must rest on a measurable threshold',
  )
}

// ---------- D) FOR YOU reasons are not invented ----------
{
  assert.match(
    rail,
    /if \(matchedGenres\.length === 0\) return 'Şu an çok okunuyor'/,
    'with no match personalization must not be faked',
  )
  assert.match(
    rail,
    /items\.flatMap\(\(item\) => item\.matchedGenres\)/,
    'the section subtitle must come from genres the engine REALLY matched',
  )
  assert.match(rail, /if \(items\.length === 0\) return null/, 'bos ray basilmamali')
  assert.match(rail, /hide-scrollbar/, 'yatay rayda native kaydirma cubugu gizlenmeli')
}

// ---------- E) Catalog on the first screen, editorial blocks BELOW ----------
{
  const jsxStart = page.indexOf('  return (\n    <div className="min-h-screen')
  assert.ok(jsxStart > 0)
  const jsx = page.slice(jsxStart)

  const forYou = jsx.indexOf('<ExploreForYouRail')
  const catalog = jsx.indexOf('{catalogTabs}')
  const results = jsx.indexOf('<ExploreResultsSection')
  const editorial = jsx.indexOf('<ExploreEditorPicksSection')

  assert.ok(forYou > 0 && catalog > 0 && results > 0 && editorial > 0)
  assert.ok(forYou < catalog, 'SANA OZEL kataloktan once')
  assert.ok(catalog < results, 'tabs before the grid')
  assert.ok(
    results < editorial,
    'editorial blocks must be BELOW the catalog; when on top the catalog sat 6.7 screens down',
  )

  /*
   * The catalog title is in ONE place. The results section also printed a "Catalog view" title;
   * stacked, the same section was named twice.
   */
  const resultsSource = read('src/pages/explore/ExploreResultsSection.tsx')
  assert.doesNotMatch(resultsSource, /Katalog görünümü/)
}

// ---------- F) Siralama etiketleri GERCEK siralamalarimiz ----------
{
  /*
   * The prototype says "Rising" and "Fastest risers in the last 7 days".
   * We have NO such momentum measure and do not name a metric as if it existed.
   */
  assert.match(page, /SORT_OPTIONS\.map\(\(sort\) => \{/, 'tabs come from the real ranking list')
  assert.doesNotMatch(
    page,
    /Son 7 gün/,
    'no claim of a time window we cannot measure',
  )
  assert.match(page, /data-testid=\{`explore-sort-\$\{sort\.id\}`\}/)
}

console.log('explore-prototype-contract: OK')
