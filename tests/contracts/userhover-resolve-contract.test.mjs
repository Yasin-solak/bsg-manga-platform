import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const source = readFileSync(
  path.join(rootDir, 'src', 'services', 'hoverCardService', 'userHover.resolve.ts'),
  'utf8',
)

assert.match(source, /async\s+function\s+fetchUserRow\b/, 'userHover.resolve fetchUserRow fonksiyonunu korumali.')
assert.match(source, /async\s+function\s+fetchResolvedUserHoverData\b/, 'userHover.resolve must keep the data resolver.')
assert.match(source, /export\s+async\s+function\s+runUserHoverNetworkResolve\b/, 'userHover.resolve network resolver exportunu korumali.')
assert.match(source, /createScopedLogger/, 'userHover.resolve scoped logger kullanmali.')
assert.match(source, /createRequestContext/, 'userHover.resolve request context uretmeli.')
assert.match(source, /writeUserHoverCacheEntries/, 'userHover.resolve cache yazimini korumali.')
assert.match(source, /markUserHoverNetworkError/, 'userHover.resolve must keep the error metric link.')
assert.match(source, /getStoreProfileEffectAssetMap/, 'userHover.resolve profil effect asset map baglantisini korumali.')

console.log('PASS user hover resolver keeps the cache, metrics and request-context contract')
