import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const userHoverResolveSource = readFileSync(path.join(rootDir, 'src', 'services', 'hoverCardService', 'userHover.resolve.ts'), 'utf8')
const fansubHoverResolveSource = readFileSync(path.join(rootDir, 'src', 'services', 'hoverCardService', 'fansubHover.resolve.ts'), 'utf8')
const fansubHoverDataSource = readFileSync(path.join(rootDir, 'src', 'services', 'hoverCardService', 'fansubHover.resolve.data.ts'), 'utf8')
const fansubHoverRowSource = readFileSync(path.join(rootDir, 'src', 'services', 'hoverCardService', 'fansubHover.resolve.row.ts'), 'utf8')
const mangaHoverSource = readFileSync(path.join(rootDir, 'src', 'services', 'hoverCardService', 'mangaHover.ts'), 'utf8')

assert.match(userHoverResolveSource, /export\s+async\s+function\s+runUserHoverNetworkResolve\b/)
assert.match(userHoverResolveSource, /createRequestContext/, 'user hover resolver request context uretmeli')
assert.match(userHoverResolveSource, /writeUserHoverCacheEntries/, 'user hover resolver cache yazimini korumali')
assert.match(userHoverResolveSource, /markUserHoverNetworkError/, 'the user hover resolver must keep the error metric')

assert.match(fansubHoverResolveSource, /export\s+async\s+function\s+runFansubHoverNetworkResolve\b/)
assert.match(fansubHoverResolveSource, /createRequestContext/, 'fansub hover network resolver request context uretmeli')
assert.match(fansubHoverResolveSource, /writeFansubHoverCacheEntries/, 'fansub hover network resolver cache yazimini korumali')

assert.match(fansubHoverDataSource, /export\s+async\s+function\s+fetchResolvedFansubHoverData\b/)
assert.match(fansubHoverDataSource, /fetchFansubRow/, 'fansub hover data resolver satir resolverini kullanmali')
assert.match(fansubHoverDataSource, /getStoreProfileEffectAssetMap/, 'fansub hover data resolver efekt asset baglantisini korumali')

assert.match(fansubHoverRowSource, /export\s+async\s+function\s+fetchFansubRow\b/)
assert.match(fansubHoverRowSource, /writeStoredColumnCapability/, 'fansub row resolver schema capability cache yazmali')
assert.match(fansubHoverRowSource, /shouldRetryWithLegacyColumns/, 'fansub row resolver legacy schema fallback korumali')

assert.match(mangaHoverSource, /export\s+async\s+function\s+resolveMangaHoverData\b/)
assert.match(mangaHoverSource, /createRequestContext/, 'manga hover resolver request context uretmeli')
assert.match(mangaHoverSource, /writeCache\(mangaCache, cacheKey, data\)/, 'manga hover resolver cache yazimini korumali')

console.log('PASS hover resolver critical export contract kept')
