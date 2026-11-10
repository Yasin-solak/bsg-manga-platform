import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const readerRoutingSource = read('src/pages/mangaReader/readerChapterRouting.ts')
const readerViewportSource = read('src/pages/mangaReader/useReaderViewportController.ts')
const readerDataSource = read('src/pages/mangaReader/useMangaReaderData.ts')
const mangaDetailsSource = read('src/services/mangaService/details.ts')
const routesSource = read('src/lib/routes.ts')

assert.match(readerRoutingSource, /export function buildChapterReaderPath\(/)
assert.match(readerRoutingSource, /export function groupChaptersByNumber\(/)
assert.match(readerRoutingSource, /export function resolvePreferredChapterVersion\(/)
assert.match(readerRoutingSource, /export function resolveAdjacentChapterVersion\(/)
assert.match(readerRoutingSource, /const currentFansubId = currentChapter\?\.fansub\?\.id \|\| null/)
assert.match(readerRoutingSource, /return versions\[0\]/)
// In Phase 7 chapter links moved to the new reader (/oku). v1 stays in RESERVE, so its internal
// navigation uses the OLD helper; what the guard protects has not changed:
// the v1 path must be built by the central helper, not by string concatenation
// (version/fansub distinguishing logic in one place).
assert.match(readerRoutingSource, /buildLegacyPublicChapterPath\(/)

assert.match(routesSource, /export function buildPublicMangaPath\(/)
assert.match(routesSource, /export function buildPublicChapterPath\(/)
assert.match(routesSource, /export function buildLegacyPublicChapterPath\(/)
assert.match(routesSource, /export function doesChapterRouteNeedVersionQuery\(/)

assert.match(readerViewportSource, /const chaptersByNumber = useMemo\(\(\) => groupChaptersByNumber\(allChapters\), \[allChapters\]\)/)
assert.match(readerViewportSource, /resolveAdjacentChapterVersion\(chaptersByNumber, readerChapterNumber, 'next', chapter\)/)
assert.match(readerViewportSource, /resolveAdjacentChapterVersion\(chaptersByNumber, readerChapterNumber, 'previous', chapter\)/)
assert.match(readerDataSource, /const mangaData = await getMangaByIdentifier\(mangaIdentifier, controller\.signal\)/)
assert.match(readerDataSource, /const canonicalPath = buildLegacyPublicChapterPath\(/)
assert.match(readerDataSource, /navigate\(canonicalPath, \{ replace: true \}\)/)
assert.match(readerDataSource, /return getChapterDetails\(mangaData\.id, parsedChapterNumber\)/)

assert.match(mangaDetailsSource, /\.order\('chapter_number', \{ ascending: false \}\)/)
assert.match(mangaDetailsSource, /\.order\('created_at', \{ ascending: false \}\)/)
assert.match(mangaDetailsSource, /export async function getMangaByIdentifier\(/)

console.log('PASS chapter version routing contract verified')
