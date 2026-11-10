import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const slugSource = read('src/lib/slug.ts')
const routesSource = read('src/lib/routes.ts')
const detailsSource = read('src/services/mangaService/details.ts')
const creationSource = read('src/services/mangaService/creation.ts')
const homeFeedSource = read('src/services/homeService/feed.ts')
const homeDiscussionSource = read('src/services/homeService/discussion.ts')

assert.match(slugSource, /const TURKISH_SLUG_CHAR_MAP/)
assert.match(slugSource, /ı: 'i'/)
assert.match(slugSource, /ş: 's'/)
assert.match(slugSource, /export function slugifyText\(/)
assert.match(slugSource, /export function buildPreferredPublicMangaSlug\(/)
assert.match(slugSource, /const GENERATED_SLUG_SUFFIX_PATTERN = \/-\(\[a-z0-9\]\{5\}\)\$\/i/)
// Baslikla zaten uyumlu slug'a dokunulmaz: sonu 5 karakterlik dogal kelimeyle
// biten slug'lar ('tokyo-ghoul') uretilmis sonek sanilip cift-kelimeli URL
// ('tokyo-ghoul-ghoul') uretmemeli.
assert.match(
  slugSource,
  /existingSlug === titleSlug \|\| existingSlug\.startsWith\(`\$\{titleSlug\}-`\)/,
  'baslikla uyumlu slug sonek birlestirmesine girmemelidir',
)

assert.match(routesSource, /title\?: string \| null/)
assert.match(routesSource, /mangaTitle\?: string \| null/)
assert.match(routesSource, /buildPreferredPublicMangaSlug\(/)

assert.match(detailsSource, /async function resolveLegacyPublicMangaId\(/)
assert.match(detailsSource, /\.like\('slug', `%-\$\{suffix\}`\)/)
assert.match(detailsSource, /if \(rows\.length === 1\) \{/)
assert.match(detailsSource, /const legacyPublicMangaId = await resolveLegacyPublicMangaId\(normalizedIdentifier, signal\)/)

assert.match(creationSource, /slugifyText\(payload\.title, \{ maxLength: 72 \}\)/)
assert.match(creationSource, /createRandomSlugSuffix\(5\)/)

assert.match(homeFeedSource, /loadMangaLiteByIds/)
assert.match(homeFeedSource, /function hydrateMangaSlugs/)
assert.match(homeDiscussionSource, /const mangaLiteMap = await loadMangaLiteByIds\(/)

console.log('PASS manga public slug contract verified')
