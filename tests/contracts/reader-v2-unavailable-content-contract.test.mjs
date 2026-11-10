/**
 * Reader v2: removed/inactive content contract.
 *
 * What the reader shows when an admin deactivates a series or chapter.
 * Measured live (2026-08-01): with the series deactivated the reader wrote
 * "Bolum yuklenemedi. | Cannot coerce the result to a single JSON object",
 * so (a) the RAW database message leaked to the user and
 * (b) the state was presented as an "error", not "missing".
 *
 * Root cause: `.single()` throws PGRST116 for 0 rows; the data layer treated this as a generic
 * error and displayed the message as is.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

const dataSource = read('src/pages/reader/useReaderV2Chapter.ts')
const pageSource = read('src/pages/reader/ReaderV2Page.tsx')

// ---------- A) Absence must not be classified as an ERROR ----------
assert.match(
  dataSource,
  /isChapterNotFoundError/,
  'an empty result must count as "not found", not a general error',
)
// The detection helper must be SHARED with v1: both readers should read the same signal
// the same way.
assert.match(
  dataSource,
  /from '@\/pages\/mangaReader\/readerChapterRouting'/,
  'not-found tespiti paylasilan yardimcidan gelmeli',
)
// Must be handled in both the series and chapter paths.
assert.equal(
  (dataSource.match(/if \(isChapterNotFoundError\(error\)\) \{/g) || []).length,
  2,
  'absence must be split in both series and chapter loading',
)

// Neden bilgisi tasinmali ki metin dogru secilebilsin.
assert.match(dataSource, /notFoundReason/, 'the absence reason must be exposed')
assert.match(dataSource, /setNotFoundReason\('manga'\)/)
assert.match(dataSource, /setNotFoundReason\('chapter'\)/)

// ---------- B) Kullaniciya gosterilen metin ----------
assert.match(pageSource, /Bu seri su anda yayinda degil/, 'series-specific text if the series was removed')
assert.match(pageSource, /Bu bolum su anda yayinda degil/, 'chapter-specific text if the chapter was removed')
// The raw technical message may be shown ONLY in a real error state.
assert.match(
  pageSource,
  /status === 'error'\s*\n?\s*\? \(errorMessage/,
  'the technical message must show only in an error state',
)
assert.doesNotMatch(
  pageSource,
  /\{status === 'not-found' \? 'Bolum bulunamadi\.' : 'Bolum yuklenemedi\.'\}/,
  'the old merged text must not come back (it leaked the raw message)',
)

// ---------- C) The exit path depends on the state ----------
// If the series was removed "back to series" is meaningless: that page is gone too.
assert.match(
  pageSource,
  /manga && notFoundReason !== 'manga'/,
  'if the series was removed it must not redirect to the series page',
)
assert.match(pageSource, /Kesfete don/, 'with no series it must return to explore')

console.log('PASS reader v2 removed content contract verified')
