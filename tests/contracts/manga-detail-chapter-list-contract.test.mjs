/**
 * Series detail > Chapters tab: grouping, search, sort, pagination.
 *
 * Protected intent:
 * 1. Chapters with the same number are ONE ROW, versions inside that row. This is the visible face
 * of the multi-fansub model; flattening rows would list the same chapter twice.
 * 2. The list prints in a WINDOW. Printing 84 chapters to the DOM at once has a measurable
 * cost on mobile.
 * 3. The window returns to the top on search/sort change.
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

const mod = loadModule('src/pages/mangaDetail/mangaDetailChapters.ts')

function chapter(chapterNumber, fansubId, title) {
  return {
    id: `${chapterNumber}-${fansubId}`,
    mangaId: 'm1',
    chapterNumber,
    title,
    pages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    fansub: { id: fansubId, name: `Ekip ${fansubId}`, slug: `ekip-${fansubId}` },
  }
}

// ---------- A) Same number one row, versions inside ----------
{
  const groups = mod.groupChapters([
    chapter(1, 'a'),
    chapter(1, 'b'),
    chapter(2, 'a'),
  ], 'newest')
  assert.equal(groups.length, 2, 'two different chapter numbers make two rows')
  const first = groups.find((group) => group.chapterNumber === 1)
  assert.equal(first.versions.length, 2, 'two versions of the same number on the same row')
}

// ---------- B) Sort works in both directions ----------
{
  const input = [chapter(3, 'a'), chapter(1, 'a'), chapter(2, 'a')]
  assert.deepEqual(
    mod.groupChapters(input, 'newest').map((group) => group.chapterNumber),
    [3, 2, 1],
    'default: newest chapter on top',
  )
  assert.deepEqual(
    mod.groupChapters(input, 'oldest').map((group) => group.chapterNumber),
    [1, 2, 3],
    '"Eski" selected sorts from the start',
  )
}

// ---------- C) Arama: numara VE baslik ----------
{
  const groups = mod.groupChapters([
    chapter(11, 'a', 'Baslangic'),
    chapter(12, 'a', 'Firtina'),
    chapter(25, 'a', 'Son Dus'),
  ], 'newest')

  assert.deepEqual(
    mod.filterChapterGroups(groups, '1').map((group) => group.chapterNumber),
    [12, 11],
    'numara aramasi alt dizgi eslesmesi',
  )
  assert.deepEqual(
    mod.filterChapterGroups(groups, 'firtina').map((group) => group.chapterNumber),
    [12],
    'title search must be case-insensitive',
  )
  assert.equal(
    mod.filterChapterGroups(groups, '   ').length,
    3,
    'a query made only of spaces must not narrow the list',
  )
  assert.equal(mod.filterChapterGroups(groups, 'yok').length, 0)
}

// ---------- D) Search does not blow up on untitled versions ----------
{
  const groups = mod.groupChapters([chapter(5, 'a', undefined)], 'newest')
  assert.equal(
    mod.filterChapterGroups(groups, 'herhangi').length,
    0,
    'a chapter with no title must not raise an error during search',
  )
  assert.equal(mod.filterChapterGroups(groups, '5').length, 1)
}

// ---------- E) Alt bilgi gercek sayilari yazar ----------
{
  assert.equal(mod.formatChapterFoot(20, 84), '84 bölümün 20 tanesi gösteriliyor')
  assert.equal(mod.formatChapterFoot(84, 84), '84 bölüm gösteriliyor')
  assert.equal(
    mod.formatChapterFoot(90, 84),
    '84 bölüm gösteriliyor',
    'if the window exceeds the total no absurd text like "90 of 84 chapters"',
  )
  assert.equal(mod.formatChapterFoot(0, 0), '', 'with no chapters the footer is not written at all')
}

// ---------- F) The sort button toggles between two states ----------
{
  assert.equal(mod.nextSortOrder('newest'), 'oldest')
  assert.equal(mod.nextSortOrder('oldest'), 'newest')
  assert.equal(mod.sortOrderLabel('newest'), 'Yeni')
  assert.equal(mod.sortOrderLabel('oldest'), 'Eski')
}

// ---------- F2) Satir alt bilgisi: GORELI zaman + surum sayisi ----------
/*
 * The prototype says "4 hours ago · 2 versions". We had an absolute date
 * ("20.08.2026"), so the row's question became "which day" rather than "is it new".
 */
{
  const now = Date.parse('2026-08-25T12:00:00.000Z')

  const fresh = mod.formatChapterMeta('2026-08-25T08:00:00.000Z', 1, now)
  assert.match(fresh, /saat/, '4 saat oncesi goreli yazilmali')
  assert.ok(!fresh.includes('sürüm'), 'writing "1 version" on a single version carries no info')

  const multi = mod.formatChapterMeta('2026-08-25T08:00:00.000Z', 2, now)
  assert.match(multi, / · 2 sürüm$/, 'on multiple versions the count must be added with a separator')

  const old = mod.formatChapterMeta('2024-01-05T00:00:00.000Z', 1, now)
  assert.match(
    old,
    /2024/,
    'older than 30 days must become an absolute date; "597 days ago" is not readable info',
  )
  assert.ok(!old.includes('gun once'), 'no relative phrase on an old chapter')

  assert.equal(
    mod.formatChapterMeta('gecersiz', 2, now),
    '2 sürüm',
    'a broken date must not blow up the row, only the time part drops',
  )
}

// ---------- G) Sayfa boyutu makul ----------
assert.ok(
  mod.CHAPTER_PAGE_SIZE > 0 && mod.CHAPTER_PAGE_SIZE <= 30,
  'the page size must be small enough not to print 84 chapters at once',
)

// ---------- H) Bilesen pencereli basar, arama pencereyi sifirlar ----------
{
  const list = read('src/pages/mangaDetail/MangaDetailChapterList.tsx')
  assert.match(
    list,
    /matched\.slice\(0, visibleCount\)/,
    'rows must pass through the window; the whole list must not print directly',
  )
  assert.match(
    list,
    /useEffect\(\(\) => \{ setVisibleCount\(CHAPTER_PAGE_SIZE\) \}, \[searchQuery, sortOrder\]\)/,
    'the window must reset on a search or sort change',
  )
  assert.match(list, /data-testid="chapter-load-more"/)
  assert.match(list, /data-testid="chapter-load-all"/)
  assert.match(list, /data-testid="chapter-sort-toggle"/)
  assert.match(
    list,
    /setVisibleCount\(matched\.length\)/,
    '"Tumu" must open the whole filtered result',
  )
  assert.match(
    list,
    /const hasMore = visible\.length < matched\.length/,
    'buttons must vanish with no rows left to show',
  )
  assert.doesNotMatch(
    list,
    /Array\.from\(new Set\(chapters\.map/,
    'grouping must happen in the derivation module, not in JSX',
  )
}

console.log('manga-detail-chapter-list-contract: OK')
