import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const hoverCardSource = readSource('src/components/common/MangaHoverCard.tsx')
const hoverTypesSource = readSource('src/services/hoverCardService/types.ts')
const hoverResolveSource = readSource('src/services/hoverCardService/mangaHover.ts')

assert.match(hoverTypesSource, /lastChapterNumber\?: number \| null/)
assert.match(hoverTypesSource, /genres\?: string\[\]/)
assert.match(hoverTypesSource, /last_chapter_number: number \| null/)
assert.match(hoverTypesSource, /genres: string\[\] \| null/)

assert.match(hoverResolveSource, /last_chapter_number/)
assert.match(hoverResolveSource, /genres/)
assert.match(hoverResolveSource, /lastChapterNumber: manga\.last_chapter_number \?\? null/)

assert.match(hoverCardSource, /data-manga-hover-disabled="true"/)
assert.match(hoverCardSource, /Hover dili tum yuzeylerde ortak standarda oturana kadar bilincli olarak kapali/)
assert.match(hoverCardSource, /optimizePublicImageUrl/)
assert.doesNotMatch(hoverCardSource, /createPortal/)
assert.doesNotMatch(hoverCardSource, /resolveMangaHoverData/)

console.log('PASS manga hover redesign contract kept')
