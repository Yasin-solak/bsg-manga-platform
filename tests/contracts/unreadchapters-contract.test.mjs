import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/**
 * The rule of the "N new chapters waiting for you" counter.
 *
 * The user's question is tested directly here: if chapter 3 came out in a followed
 * series and they READ that chapter the number must drop.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function loadModule(relativePath) {
  const source = readFileSync(path.join(rootDir, relativePath), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, () => ({}))
  return shim.exports
}

const { summarizeUnread } = loadModule('src/lib/unreadChapters.ts')

const followedAt = '2026-01-01T00:00:00.000Z'
const follows = [{ mangaId: 'm1', followedAt }]
const chapters = [
  { mangaId: 'm1', chapterNumber: 1, publishAt: '2026-01-02T00:00:00.000Z' },
  { mangaId: 'm1', chapterNumber: 2, publishAt: '2026-01-03T00:00:00.000Z' },
  { mangaId: 'm1', chapterNumber: 3, publishAt: '2026-01-04T00:00:00.000Z' },
]

// ---------- A) Hic okumadiysa hepsi sayilir ----------
assert.equal(summarizeUnread(follows, chapters, []).count, 3)

// ---------- B) THE CASE THE USER ASKED: reading 3 LOWERS the count ----------
// "Series x has chapter 3, what if I read that chapter 3?" -> it leaves the count.
{
  const r = summarizeUnread(follows, chapters, [{ mangaId: 'm1', lastReadChapter: 3 }])
  assert.equal(r.count, 0, 'reading chapter 3 must leave nothing unread')
}
{
  const r = summarizeUnread(follows, chapters, [{ mangaId: 'm1', lastReadChapter: 1 }])
  assert.equal(r.count, 2, 'with 1 read, 2 and 3 remain')
}

// ---------- C) Those published BEFORE FOLLOWING are not "new" ----------
// Otherwise following an old 500-chapter series would say "500 new chapters".
{
  const eski = [{ mangaId: 'm1', chapterNumber: 1, publishAt: '2025-06-01T00:00:00.000Z' }]
  assert.equal(summarizeUnread(follows, eski, []).count, 0)
}

// ---------- D) Takip EDILMEYEN seri sayilmaz ----------
{
  const yabanci = [{ mangaId: 'm9', chapterNumber: 1, publishAt: '2026-01-05T00:00:00.000Z' }]
  assert.equal(summarizeUnread(follows, yabanci, []).count, 0)
}

// ---------- E) A chapter with an unknown publish moment is not counted ----------
// Counting a chapter with unknown time as "new" would silently inflate the counter.
{
  const zamansiz = [{ mangaId: 'm1', chapterNumber: 4, publishAt: null }]
  assert.equal(summarizeUnread(follows, zamansiz, []).count, 0)
}

// ---------- F) Series are sorted by NEWEST chapter ----------
// We will show covers in order; the order must not be random.
{
  const coklu = [
    { mangaId: 'm1', followedAt },
    { mangaId: 'm2', followedAt },
  ]
  const bolumler = [
    { mangaId: 'm1', chapterNumber: 5, publishAt: '2026-01-02T00:00:00.000Z' },
    { mangaId: 'm2', chapterNumber: 9, publishAt: '2026-01-09T00:00:00.000Z' },
  ]
  const r = summarizeUnread(coklu, bolumler, [])
  assert.deepEqual(r.mangaIds, ['m2', 'm1'], 'the series with the newest chapter must come first')
}

// ---------- G) A lagging progress record for one series does not break the ADVANCE ----------
{
  const r = summarizeUnread(follows, chapters, [
    { mangaId: 'm1', lastReadChapter: 3 },
    { mangaId: 'm1', lastReadChapter: 1 },
  ])
  assert.equal(r.count, 0, 'the furthest record must hold')
}


// ---------- H) AYNI BOLUM FARKLI FANSUBDAN: TEK sayilir ----------
/*
 * `chapters` uniqueness is (manga_id, chapter_number, fansub_id): several fansubs can upload the
 * same chapter and live data ALREADY has that (Mavi Gece
 * Güncesi chapter 3 from two fansubs). Counting rows would say "2 new chapters";
 * there is one chapter to read, just two translation options.
 */
{
  const ikiFansub = [
    { mangaId: 'm1', chapterNumber: 4, publishAt: '2026-01-05T00:00:00.000Z' },
    { mangaId: 'm1', chapterNumber: 4, publishAt: '2026-01-06T00:00:00.000Z' },
    { mangaId: 'm1', chapterNumber: 5, publishAt: '2026-01-07T00:00:00.000Z' },
  ]
  const r = summarizeUnread(follows, ikiFansub, [])
  assert.equal(r.count, 2, '4 and 5 -> two chapters; the same 4 must not count twice')
}

// ---------- I) The two scenarios the user asked ----------
{
  // "I read 4 from fansub Y, X also uploaded 4" -> not counted.
  const ayniBolumBaskaFansub = [
    { mangaId: 'm1', chapterNumber: 4, publishAt: '2026-01-06T00:00:00.000Z' },
  ]
  assert.equal(
    summarizeUnread(follows, ayniBolumBaskaFansub, [{ mangaId: 'm1', lastReadChapter: 4 }]).count,
    0,
    'another fansub copy of a read chapter must not count as new',
  )

  // "I read 4 from Y, X posted 5" -> counted once.
  const sonrakiBolum = [
    { mangaId: 'm1', chapterNumber: 5, publishAt: '2026-01-07T00:00:00.000Z' },
  ]
  assert.equal(
    summarizeUnread(follows, sonrakiBolum, [{ mangaId: 'm1', lastReadChapter: 4 }]).count,
    1,
  )
}

console.log('PASS unread chapter counter contract verified')
