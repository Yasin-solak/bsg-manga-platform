import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const pageSource = [readSource('src/pages/ExplorePage.tsx'), readSource('src/pages/explore/useExploreData.ts'), readSource('src/pages/explore/ExploreDesktopView.tsx')].join('\n')
const toolbarSource = readSource('src/pages/explore/ExploreToolbar.tsx')
const genreSheetSource = readSource('src/pages/explore/ExploreGenreSheet.tsx')
const resultsSource = readSource('src/pages/explore/ExploreResultsSection.tsx')
const cardSource = readSource('src/pages/explore/ExploreMangaCard.tsx')
const sharedSource = readSource('src/pages/explore/explorePageShared.ts')

const requiredFiles = [
  'src/pages/explore/ExploreToolbar.tsx',
  'src/pages/explore/ExploreGenreSheet.tsx',
  'src/pages/explore/ExploreResultsSection.tsx',
  'src/pages/explore/ExploreMangaCard.tsx',
  'src/pages/explore/explorePageShared.ts',
]

for (const relativePath of requiredFiles) {
  assert.equal(existsSync(path.join(rootDir, relativePath)), true, `${relativePath} bulunamadi`)
}

assert.doesNotMatch(pageSource, /ExploreHero/)
assert.doesNotMatch(pageSource, /Okuma zevkine/)
assert.doesNotMatch(pageSource, /Keşfet alanı|KeÅŸfet alanÄ±|Kesfet alani/)
/*
 * INTENT UPDATED: these two components were the old answer to "does the page have a filter surface".
 * In the prototype's Explore screen the filter is a separate button and a BOTTOM SHEET;
 * ExploreFilterSheet replaced ExploreToolbar and ExploreGenreSheet.
 * The guard was not deleted, it points to the new surface:
 * what is protected is the same: the page must have a filter surface and a results surface.
 */
assert.match(pageSource, /ExploreFilterSheet/)
assert.match(pageSource, /ExploreResultsSection/)
assert.match(pageSource, /getLatestMangas/)
assert.match(pageSource, /getPopularMangas/)
assert.match(pageSource, /setCurrentPage\(\(previous\) => previous \+ 1\)/)
assert.match(pageSource, /setQueryVersion\(\(previous\) => previous \+ 1\)/)
assert.doesNotMatch(pageSource, /getPageNumbers|ChevronLeft|ChevronRight/)
assert.doesNotMatch(pageSource, /params\.set\('page'/)
assert.doesNotMatch(
  pageSource,
  /const fallback = await listMangas\(/,
  'the Explore editor fallback rail must not reuse the general search RPC endpoint',
)
assert.doesNotMatch(
  pageSource,
  /const result = await listMangas\(\{\s*sort: 'latest'/,
  'the Explore latest rail must not reuse the general search RPC endpoint',
)

assert.match(toolbarSource, /STATUS_OPTIONS/)
assert.match(toolbarSource, /SORT_OPTIONS/)
assert.match(toolbarSource, /Temizle/)

assert.doesNotMatch(genreSheetSource, /PopoverContent/)
assert.match(genreSheetSource, /SheetTrigger/)
assert.match(genreSheetSource, /side=\{isMobile \? 'bottom' : 'right'\}/)
assert.match(genreSheetSource, /Tür filtreleri|Tur filtreleri|TÃ¼r filtreleri/)

assert.match(resultsSource, /Daha fazla yükle|Daha fazla yukle/)
assert.match(resultsSource, /data-hover-card-boundary/)
assert.match(resultsSource, /ExploreMangaCard/)

assert.match(cardSource, /MangaCard/)
assert.match(cardSource, /descriptionFallback/)
assert.match(cardSource, /className="[^"]*h-full/)

assert.match(sharedSource, /ITEMS_PER_PAGE = 21/)
assert.match(sharedSource, /useExploreMediaQuery/)
assert.match(sharedSource, /mergeMangaPages/)

console.log('PASS explore page redesign contract kept')
