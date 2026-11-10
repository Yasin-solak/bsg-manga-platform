/**
 * Reader v2 read tracking contract.
 *
 * This is a REGRESSION pin. v1 called `track_manga_read` while a chapter was read and wrote the
 * user's reading history; it had not moved to v2, and when /oku became the primary
 * reader reads SILENTLY stopped being counted (views,
 * "continue where you left off", profile stats, tasks tied to read
 * count). With no error it was hard to notice.
 *
 * The rules must be the SAME in both readers: read count should not mean something
 * different depending on where it was read.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

const trackingSource = read('src/pages/reader/useReaderV2ReadTracking.ts')
const pageSource = read('src/pages/reader/ReaderV2Page.tsx')
const legacySource = read('src/pages/mangaReader/useMangaReaderData.ts')

// ---------- A) Tracking must REALLY be wired ----------
// The call must be in the COMPONENT BODY, unconditional. Pinning only that the
// "name appears" was not enough: a mutation test hiding the call inside a function
// passed (the pin stayed green with the hook never running).
assert.match(
  pageSource,
  /^ {2}useReaderV2ReadTracking\(\{/m,
  'okuma takibi bilesen govdesinde kosulsuz cagrilmali',
)
assert.match(trackingSource, /trackMangaRead\(/, 'the view/read RPC must be called')
assert.match(trackingSource, /addReadingHistory\(/, 'the user reading history must be written')

// ---------- B) Rules from the same source as v1 ----------
// Deduplication must not be copied: the rule that one chapter is not counted twice in one session
// must stay in one place.
assert.match(
  trackingSource,
  /from '@\/pages\/mangaReader\/readerChapterRouting'/,
  'the dedupe helper must be SHARED with v1 (a copy means two different counts)',
)
assert.match(trackingSource, /shouldTrackRead\(/)
assert.match(trackingSource, /getReaderClientKey\(\)/, 'the client key must come from the same service')

// ---------- C) Acip kapatan sekme okuma sayilmamali ----------
assert.match(
  trackingSource,
  /READER_V2_READ_TRACK_MIN_VISIBLE_MS = 8_000/,
  'the visible stay threshold must match v1 (8 s)',
)
const legacyThreshold = legacySource.match(/READ_TRACK_MIN_VISIBLE_MS = ([0-9_]+)/)?.[1]
assert.equal(legacyThreshold, '8_000', 'v1 esigi degistiyse v2 de birlikte gozden gecirilmeli')

// Arka plandaki sekme sayilmamali, one gelince denenmeli.
assert.match(trackingSource, /document\.visibilityState !== 'visible'/, 'arka planda sayilmamali')
assert.match(trackingSource, /addEventListener\('visibilitychange'/, 'must retry on returning to the foreground')
assert.match(trackingSource, /window\.addEventListener\('focus'/)

// ---------- D) History must not be written for signed-out users ----------
assert.match(
  trackingSource,
  /if \(currentUserId\) \{\s*\n\s*void addReadingHistory/,
  'reading history must be written only for signed-in users',
)

// ---------- E) Cleanup: no old timer left when the chapter changes ----------
assert.match(trackingSource, /cancelled = true/, 'a pending track must cancel on chapter change')
assert.match(trackingSource, /window\.clearTimeout\(timeoutId\)/, 'the timer must be cleared')
assert.match(trackingSource, /removeEventListener\('visibilitychange'/, 'dinleyiciler kaldirilmali')

// ---------- F) v1 takibi yerinde kalmali (yedek okuyucu tutarli) ----------
assert.match(legacySource, /void trackMangaRead\(/, 'v1 okuma takibi silinmemeli')

console.log('PASS reader v2 read tracking contract verified')
