/**
 * Series detail > "Similar series" reason + genre chip folding.
 *
 * Protected intent:
 * 1. Reasons are NOT INVENTED. The query narrows by the first three genres; what the screen says
 * is exactly the intersection with THAT SET.
 * 2. The sentence here is NOT onboarding's "... because you like". The match uses the viewed
 * series' genres, not the user's taste.
 * 3. The strip and right column are not drawn together (the same list twice).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function loadModule(relativePath) {
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  const stub = new Proxy({}, { get: () => new Proxy(() => ({}), { get: () => () => {} }) })
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, (id) => (id === '@/i18n/activeLocale' ? { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)) } : stub))
  return shim.exports
}

const { similarReasonLabel } = loadModule('src/pages/mangaDetail/mangaDetailSimilar.ts')
const identity = (genre) => genre

// ---------- A) With no match personalization is NOT FAKED ----------
{
  const label = similarReasonLabel([], identity)
  assert.equal(label, 'Şu an çok okunuyor')
  assert.ok(!label.includes('tur'), 'eslesme yokken tur iddia edilmemeli')
}

// ---------- B) Matched genres are written, at most two ----------
{
  assert.equal(similarReasonLabel(['Aksiyon'], identity), 'Aynı tür: Aksiyon')
  assert.equal(similarReasonLabel(['Aksiyon', 'Korku'], identity), 'Aynı tür: Aksiyon, Korku')
  assert.equal(
    similarReasonLabel(['Aksiyon', 'Korku', 'Gizem', 'Dram'], identity),
    'Aynı tür: Aksiyon, Korku',
    'one line per row; more than two get clipped',
  )
}

// ---------- C) Onboarding cumlesi buraya SIZMAMALI ----------
{
  const label = similarReasonLabel(['Aksiyon'], identity)
  assert.ok(
    !label.includes('sevdi'),
    'matching is built from the viewed series genres, not the user taste',
  )
}

// ---------- D) Etiket bicimlendirici gercekten kullanilir ----------
{
  assert.equal(
    similarReasonLabel(['KaranlikFantazi'], (genre) => (genre === 'KaranlikFantazi' ? 'Karanlik Fantazi' : genre)),
    'Aynı tür: Karanlik Fantazi',
    'the display label must be written, not the raw genre key',
  )
}

// ---------- E) The service produces the reason from the SAME set as the query ----------
{
  const service = read('src/services/mangaService/discovery.list.ts')
  assert.match(
    service,
    /const overlapGenres = normalizedGenres\.slice\(0, 3\)/,
    'the set used by the query must be kept in one variable',
  )
  assert.match(
    service,
    /query\.overlaps\('genres', overlapGenres\)/,
    'sorgu o kumeyle daraltilmali',
  )
  assert.match(
    service,
    /new Set\(overlapGenres\.map/,
    'the reason must be computed from the SAME set; no second genre list derived',
  )
  assert.match(
    service,
    /export interface RelatedMangaSuggestion/,
    'suggestion + reason must return together',
  )
}

// ---------- F) The strip and right column are not drawn together ----------
{
  const strip = read('src/pages/mangaDetail/MangaDetailSimilarStrip.tsx')
  const page = read('src/pages/MangaDetailPage.tsx')

  /*
   * Searching a single `lg:hidden` was blind: the file has two sections (loading and
   * filled); removed from one, the regex found the other and kept passing.
   * We match by section count.
   */
  const sectionCount = (strip.match(/<section/g) || []).length
  const hiddenCount = (strip.match(/lg:hidden/g) || []).length
  assert.equal(sectionCount, 2, 'the strip draws two parts: loading + filled')
  assert.equal(
    hiddenCount,
    sectionCount,
    'each strip part (including skeleton) must hide on wide screens; otherwise the same list draws twice with the right column',
  )
  assert.match(strip, /hide-scrollbar/, 'the native scrollbar must hide on the horizontal strip')
  assert.match(strip, /data-testid="manga-detail-similar-reason"/)

  assert.match(
    page,
    /selectedTab === 'chapters' && hasPrimedRelated \? \(/,
    'the strip must sit in the CHAPTERS tab as in the prototype',
  )
  assert.match(
    page,
    /<aside className="hidden lg:block/,
    'the right column must stay on wide screens',
  )
  assert.doesNotMatch(
    page,
    /Mobilde iliskili mangalar/,
    'the old mobile panel at the page bottom must be removed (otherwise the list draws twice)',
  )
  assert.match(
    page,
    /formatGenreLabel=\{formatGenreLabel\}/,
    'the right column must also write the reason with the formatted label',
  )
}

// ---------- G) Tur cipleri katlanir ----------
{
  const hero = read('src/pages/mangaDetail/MangaDetailHeroCard.tsx')
  assert.match(hero, /const GENRE_PREVIEW_COUNT = 3/, 'same as the prototype: first three genres')
  assert.match(
    hero,
    /genresExpanded \? allGenres : allGenres\.slice\(0, GENRE_PREVIEW_COUNT\)/,
    'collapsed only the preview amount must print',
  )
  assert.match(
    hero,
    /const hiddenGenreCount = allGenres\.length - GENRE_PREVIEW_COUNT/,
    'the button must write the REAL hidden count',
  )
  assert.match(hero, /data-testid="manga-detail-genres-toggle"/)
  assert.match(
    hero,
    /hiddenGenreCount > 0 \?/,
    'with three or fewer genres the collapse button must not render at all',
  )
}

console.log('manga-detail-similar-contract: OK')
