/**
 * Explore: prototype layout Phase 2: Today's mood, Top 5 read, By genre.
 *
 * Measures came from the FULL PROTOTYPE file the user shared (46 screens;
 * `Keşfet` / `Arama` / `Sonuçlar` exist there, not in the exported .dc.html).
 *
 * Protected intent:
 * 1. Mood filters run a REAL query; the genre id is CONVERTED to catalog values.
 * 2. Two moods based on chapter count are NOT DRAWN: the field is wrong in live data.
 * 3. NO rank change column: handwritten fixed data even in the prototype.
 * 4. Genre card counts come from a real catalog count; an empty genre is not drawn.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const CR = String.fromCharCode(13)

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8').split(CR).join('')
}

function loadModule(relativePath) {
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  const stub = new Proxy({}, { get: () => new Proxy(() => ({}), { get: () => () => {} }) })
  // Metin katmani gercek davranisiyla: Turkce etkin dilde sablon doldurulur.
  const activeLocale = {
    intlLocale: () => 'tr-TR',
    txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)),
  }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, (id) => (id === '@/i18n/activeLocale' ? activeLocale : stub))
  return shim.exports
}

const page = [read('src/pages/ExplorePage.tsx'), read('src/pages/explore/useExploreData.ts'), read('src/pages/explore/ExploreDesktopView.tsx')].join('\n')
const mood = read('src/pages/explore/ExploreMoodSection.tsx')
const top = read('src/pages/explore/ExploreTopWeekly.tsx')
const grid = read('src/pages/explore/ExploreGenreGrid.tsx')

// ---------- A) Hava tanimlari: yalnizca TUR eksenli olanlar ----------
{
  const moods = loadModule('src/pages/explore/exploreMoods.ts')

  assert.ok(moods.EXPLORE_MOODS.length > 0, 'there must be at least one mood')
  for (const entry of moods.EXPLORE_MOODS) {
    assert.ok(entry.genres.length > 0, `${entry.id} must rest on a genre set`)
  }

  /*
   * The prototype also has "Short & finished" (under 80 chapters) and "Long marathon" (100+) moods.
   * Both need `mangas.last_chapter_number`, and that field is
   * WRONG IN LIVE DATA: the repo has a measured note (migration
   * 20260801200000). A mood that filters wrongly is worse than no mood.
   */
  const ids = moods.EXPLORE_MOODS.map((entry) => entry.id)
  assert.ok(!ids.includes('short'), 'a mood relying on chapter count must not render')
  assert.ok(!ids.includes('binge'), 'a mood relying on chapter count must not render')

  assert.equal(moods.findMood('night')?.id, 'night')
  assert.equal(moods.findMood(null), null)
  assert.equal(moods.findMood('short'), null, 'an undefined mood must be silently ignored')

  assert.match(moods.formatMoodCount(0), /Sonuç yok/)
  assert.match(moods.formatMoodCount(34), /34 seri/)
}

// ---------- B) Hava sorgusu tur kimligini CEVIRIR ----------
{
  /*
   * `mangas.genres` holds Turkish names. Passing the canonical id (`horror`)
   * directly to the query matched nothing: the mood said "No results", as measured.
   */
  assert.match(
    mood,
    /genres: resolveGenreQueryValues\(activeMood\.genres\)/,
    'the mood query must go through the resolver',
  )
  assert.doesNotMatch(
    mood,
    /genres: activeMood\.genres[,\s]/,
    'a raw canonical id must not go into the query',
  )
  assert.match(
    page,
    /const resolveGenreQueryValues = useCallback/,
    'the resolver must be defined in one place on the page',
  )
  assert.match(
    page,
    /resolveGenreQueryValues=\{resolveGenreQueryValues\}/,
    'the resolver must be passed to the mood section',
  )
  assert.match(
    page,
    /const selectedGenreQueryValues = useMemo\(\s*\n?\s*\(\) => resolveGenreQueryValues\(selectedGenres\)/,
    'the catalog must use the SAME resolver too; two separate mappings would diverge',
  )
}

// ---------- C) Mood panel: empty state, clearing, cancellation ----------
{
  assert.match(mood, /data-testid="explore-mood-results"/)
  assert.match(mood, /data-testid="explore-mood-clear"/)
  assert.match(
    mood,
    /Bu havada uygun seri kalmadı — başka bir hava dene\./,
    'an empty result must not stay silent',
  )
  assert.match(
    mood,
    /controller\.abort\(\)/,
    'a mood change must cancel the previous request',
  )
  assert.match(
    mood,
    /variant="railCompact"/,
    'mood results must use the narrow cards of the prototype',
  )
}

// ---------- D) Sira degisimi sutunu YOK ----------
{
  /*
   * The prototype has a ↑+4 / ↓−1 column on the right but values come from a handwritten
   * fixed table (DC_TREND). Last week's ranking is NOT SAVED here; we do not draw an invented arrow.
   */
  /*
   * Searching a word was blind: the explanatory comment names the prototype's fixed table
   * and the assertion caught its own comment. What to measure is STRUCTURE: a rank change column
   * needs an arrow icon, and this file only imports a star icon.
   */
  assert.match(
    top,
    /^import \{ Star \} from 'lucide-react'$/m,
    'the row has only the rating star; an arrow icon would mean a rank change column was added',
  )
  assert.doesNotMatch(
    top,
    /Pazartesi güncellenir/,
    'no claim of a weekly workflow we have not built',
  )
  assert.match(top, /Toplam okunmaya göre/, 'what the list is sorted by must be stated')
  assert.match(top, /const TOP_COUNT = 5/)
  assert.match(top, /if \(items\.length === 0\) return null/, 'bos liste basilmamali')
}

// ---------- E) Tur karti sayilari gercek, bos tur cizilmez ----------
{
  assert.match(
    grid,
    /genres\.filter\(\(genre\) => \(genre\.count \|\| 0\) > 0\)/,
    'a genre with zero count must not render: it leads to an empty door',
  )
  assert.match(grid, /\(genre\.count \|\| 0\)\.toLocaleString\(intlLocale\(\)\)/)
  assert.match(grid, /const PREVIEW_COUNT = 6/, 'the prototype shows six cards')
  assert.match(grid, /data-testid="explore-genre-grid-toggle"/)
  assert.match(
    grid,
    /hiddenCount > 0 \? \(/,
    'with no genre to hide the "All" button must not render',
  )
}

// ---------- F) Bolumler prototip sirasinda ----------
{
  const jsxStart = page.indexOf('  return (\n    <div className="min-h-screen')
  assert.ok(jsxStart > 0)
  const jsx = page.slice(jsxStart)

  const order = [
    '<ExploreForYouRail',
    '<ExploreMoodSection',
    '{catalogTabs}',
    '<ExploreTopWeekly',
    '<ExploreGenreGrid',
  ].map((needle) => {
    const at = jsx.indexOf(needle)
    assert.ok(at > 0, `${needle} bulunamadi`)
    return at
  })

  for (let index = 1; index < order.length; index += 1) {
    assert.ok(
      order[index - 1] < order[index],
      'sections must follow the prototype order: For you -> Mood today -> Catalog -> Top 5 -> Genres',
    )
  }
}

console.log('explore-mood-contract: OK')
