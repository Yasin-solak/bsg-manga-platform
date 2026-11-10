import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const mangaCardSource = readSource('src/components/common/MangaCard.tsx')
const skeletonSource = readSource('src/components/common/Skeleton/MangaCardSkeleton.tsx')

assert.match(mangaCardSource, /BookOpenText/)
assert.match(mangaCardSource, /descriptionFallback/)
assert.match(mangaCardSource, /chapterFallback/)
assert.match(mangaCardSource, /optimizePublicImageUrl/)
assert.match(mangaCardSource, /Devam ediyor|Tamamlandi|Ara verdi/)
assert.match(skeletonSource, /aspect-\[3\/4\]/)
assert.match(skeletonSource, /rounded-\[1\.45rem\]/)

console.log('PASS manga card standard kept')
