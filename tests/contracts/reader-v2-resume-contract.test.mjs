/**
 * "Continue from your page" contract (Phase A, per device).
 *
 * Protected decisions:
 * 1. Position is stored in PAGES, NOT `scrollTop`. Scroll position is meaningless
 * across devices (and on the same device after a zoom change).
 * 2. Restoring is not BLIND: it jumps only with meaningful progress;
 * with the position at the start or end the chapter opens normally.
 * 3. If the page count changes (the fansub re-uploaded / another version) the index
 * stays in range; if the target is not found NO jump happens.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

function loadModule(relativePath) {
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, () => ({}))
  return shim.exports
}

const engine = loadModule('src/pages/reader/readerV2ResumeEngine.ts')
const storage = loadModule('src/pages/reader/readerV2PositionStorage.ts')

/** A 10-page chapter, each page 1000px. */
const pages = Array.from({ length: 10 }, (_, index) => ({ start: index * 1000, size: 1000 }))

// ---------- A) From scroll to page ----------
{
  const at = (scrollPosition) => engine.resolveReaderV2PositionFromScroll({ scrollPosition, pages })

  assert.deepEqual(at(0), { pageIndex: 0, pageOffsetRatio: 0 }, 'chapter start is the first page')
  assert.deepEqual(at(3400), { pageIndex: 3, pageOffsetRatio: 0.4 }, '40% of page 4')
  assert.deepEqual(at(9999), { pageIndex: 9, pageOffsetRatio: 0.999 }, 'last page')
  assert.deepEqual(at(-50), { pageIndex: 0, pageOffsetRatio: 0 }, 'negatif konum basa dusmeli')
  assert.equal(engine.resolveReaderV2PositionFromScroll({ scrollPosition: 0, pages: [] }), null, 'no page means no position')

  // An overflowing position (content shrank) must stay on the last page and not blow up.
  const overflow = at(999999)
  assert.equal(overflow.pageIndex, 9)
  assert.equal(overflow.pageOffsetRatio, 1)
}

// ---------- B) Sayfadan kaydirmaya ----------
{
  const scroll = (position, list = pages) => engine.resolveReaderV2ScrollFromPosition({ position, pages: list })

  assert.equal(scroll({ pageIndex: 3, pageOffsetRatio: 0.4 }), 3400, 'going back must reach the same spot')
  assert.equal(scroll({ pageIndex: 0, pageOffsetRatio: 0 }), 0)

  // The chapter SHRANK: we were at page 10, now there are 4 pages.
  const shorter = pages.slice(0, 4)
  assert.equal(scroll({ pageIndex: 9, pageOffsetRatio: 0.5 }, shorter), 3500, 'indeks araliga kirpilmali')

  assert.equal(scroll({ pageIndex: 0, pageOffsetRatio: 0 }, []), null, 'no jump with no page')
  assert.equal(
    scroll({ pageIndex: 0, pageOffsetRatio: 0 }, [{ start: 0, size: 0 }]),
    null,
    'no jump to an unmeasured page (better no move than the wrong place)',
  )
}

// ---------- C) Ne zaman atlanir ----------
{
  const should = (pageIndex, pageOffsetRatio = 0, pageCount = 10) =>
    engine.shouldRestoreReaderV2Position({ position: { pageIndex, pageOffsetRatio }, pageCount })

  assert.equal(should(0), false, 'no jump needed on the first page')
  assert.equal(should(4), true, 'ortada kalmissa atlanmali')
  assert.equal(should(9, 0.9), false, 'bitirmis sayilan konumda atlanmamali')
  assert.equal(engine.shouldRestoreReaderV2Position({ position: null, pageCount: 10 }), false, 'no jump with no record')
  assert.equal(should(4, 0, 0), false, 'no jump with an unknown page count')

  // Thresholds are tested explicitly so the "read a bit" vs "finished" distinction does not drift.
  // Over 100 pages: each page is exactly 1%, so the limit is clearly measurable.
  const min = engine.READER_V2_RESUME_MIN_RATIO
  const max = engine.READER_V2_RESUME_MAX_RATIO
  assert.ok(min > 0 && min < max && max < 1, 'thresholds must be consistent')

  assert.equal(should(min * 100, 0, 100), true, 'tam alt esikte atlanmali (dahil)')
  assert.equal(should(min * 100 - 1, 0, 100), false, 'alt esigin altinda atlanmamali')
  assert.equal(should(max * 100, 0, 100), true, 'tam ust esikte atlanmali (dahil)')
  assert.equal(should(max * 100, 0.5, 100), false, 'ust esigin ustunde atlanmamali')
}

// ---------- D) Depolama saglamligi ----------
{
  assert.deepEqual(storage.sanitizeReaderV2PositionMap(null), {})
  assert.deepEqual(storage.sanitizeReaderV2PositionMap([1, 2]), {}, 'dizi kabul edilmemeli')

  const cleaned = storage.sanitizeReaderV2PositionMap({
    ok: { pageIndex: 3, pageOffsetRatio: 0.4, at: 5 },
    negatif: { pageIndex: -1, pageOffsetRatio: 0.2, at: 5 },
    oranBozuk: { pageIndex: 1, pageOffsetRatio: 1.5, at: 5 },
    eksik: { pageIndex: 2 },
    '': { pageIndex: 1, pageOffsetRatio: 0.1, at: 5 },
  })
  assert.deepEqual(Object.keys(cleaned), ['ok'], 'only valid records must remain')

  // Storage must not bloat: the NEWEST records are kept.
  const many = Object.fromEntries(
    Array.from({ length: storage.READER_V2_POSITION_MAX_ENTRIES + 10 }, (_, index) => [
      `ch-${index}`,
      { pageIndex: 1, pageOffsetRatio: 0, at: index },
    ]),
  )
  const pruned = storage.pruneReaderV2PositionMap(many)
  assert.equal(Object.keys(pruned).length, storage.READER_V2_POSITION_MAX_ENTRIES, 'record count must be limited')
  assert.ok('ch-' + (storage.READER_V2_POSITION_MAX_ENTRIES + 9) in pruned, 'the newest record must be kept')
  assert.ok(!('ch-0' in pruned), 'the oldest record must drop')
}

// ---------- E) Baglanti katmani niyeti ----------
const hookSource = read('src/pages/reader/useReaderV2Resume.ts')
assert.doesNotMatch(hookSource, /scrollTop:\s*element\.scrollTop\s*\}\)/, 'ham kaydirma konumu saklanmamali')
assert.match(hookSource, /writeStoredReaderV2Position/, 'konum kaydedilmeli')
assert.match(hookSource, /POSITION_WRITE_THROTTLE_MS/, 'must not write each frame (must be throttled)')
assert.match(hookSource, /restoredForChapterRef/, 'restore must happen ONCE per chapter')

const floatingSource = read('src/pages/reader/ReaderV2FloatingControls.tsx')
assert.match(floatingSource, /data-testid="reader-v2-resume-notice"/, 'a jump must not be silent')
assert.match(floatingSource, /data-testid="reader-v2-resume-restart"/, 'starting over must be one click')

const pageSource = read('src/pages/reader/ReaderV2Page.tsx')
assert.match(pageSource, /^ {2}\} = useReaderV2Resume\(\{/m, 'the reader must use the resume layer (unwrapped by a condition)')
assert.match(pageSource, /onRestartFromBeginning=\{restartFromBeginning\}/, 'bastan basla komutu baglanmali')

// ---------- F) Cihazlar arasi senkron (Faz B) ----------
{
  const pick = (local, remote) => engine.pickReaderV2Position({ local, remote })
  const localAt = (pageIndex, at) => ({ position: { pageIndex, pageOffsetRatio: 0.5 }, at })

  assert.equal(pick(null, null), null, 'no jump with no record on either side')

  assert.deepEqual(
    pick(localAt(3, 100), null),
    { position: { pageIndex: 3, pageOffsetRatio: 0.5 }, source: 'local' },
    'with no remote record the local one is used',
  )

  assert.deepEqual(
    pick(null, { pageIndex: 7, at: 100 }),
    { position: { pageIndex: 7, pageOffsetRatio: 0 }, source: 'remote' },
    'with no local record the remote one is used',
  )

  // No device "ownership": the NEWER wins. A reader who continued on the phone and returned
  // to desktop should see where they stopped on the phone.
  assert.equal(pick(localAt(3, 100), { pageIndex: 9, at: 200 }).source, 'remote', 'a newer remote wins')
  assert.equal(pick(localAt(3, 300), { pageIndex: 9, at: 200 }).source, 'local', 'a newer local wins')
  assert.equal(pick(localAt(3, 200), { pageIndex: 9, at: 200 }).source, 'local', 'on a tie local stays (no needless jump)')

  // A remote record has no ratio WITHIN the page; it goes to the page top.
  assert.equal(pick(null, { pageIndex: 7, at: 1 }).position.pageOffsetRatio, 0, 'a remote position must go to the page top')
}

// ---------- G) Senkron SEYREK olmali ----------
{
  const hook = read('src/pages/reader/useReaderV2Resume.ts')
  // Position changes often; writing to the server on each scroll would needlessly burn the only
  // bottleneck in the scale notes (Postgres CPU).
  assert.doesNotMatch(
    hook.slice(hook.indexOf('const recordPosition'), hook.indexOf('const flushRemotePosition')),
    /saveRemoteReadingPosition/,
    'no server write during scrolling',
  )
  assert.match(hook, /visibilitychange/, 'must write when the tab hides')
  assert.match(hook, /pagehide/, 'must write when leaving the page')
  assert.match(hook, /syncedSignatureRef/, 'the same position must not write repeatedly')
  assert.match(hook, /remoteResolvedRef\.current !== chapterId\) return/, 'no jump before the remote response (double jump)')

  const activity = read('src/services/userService/activity.ts')
  // If another chapter was opened in between the write must match NO row; otherwise the new
  // chapter's position would be overwritten by the old chapter's page.
  const save = activity.slice(activity.indexOf('export async function saveRemoteReadingPosition'))
  assert.match(save, /\.eq\('chapter_id', input\.chapterId\)/, 'the write must be guarded by chapter equality')

  // When the chapter changes the previous chapter's page does not belong to the new chapter.
  const add = activity.slice(
    activity.indexOf('export async function addReadingHistory'),
    activity.indexOf('export interface RemoteReadingPosition'),
  )
  assert.match(add, /page_index: null/, 'page position must reset on chapter entry')
  assert.match(add, /position_at: null/, 'the timestamp must reset too')
}

console.log('PASS reader v2 resume contract verified')
