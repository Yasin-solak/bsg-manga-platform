import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { z } from 'zod'
import { activeLocaleShim } from './i18n-source.mjs'

function load(relative, imports = {}) {
  const source = readFileSync(new URL('../../' + relative, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', output)(module, module.exports, (name) => { if (name === '@/i18n/activeLocale') return activeLocaleShim;
    assert.ok(name in imports, `Unexpected dependency: ${name}`)
    return imports[name]
  })
  return module.exports
}
const { nextMobileCatalogSelection } = load('src/pages/explore/mobileExploreState.ts')
assert.deepEqual(nextMobileCatalogSelection('rating', 'popular', 'completed'), { sort: 'rating', status: 'completed' })
assert.deepEqual(nextMobileCatalogSelection('completed', 'latest', 'all'), { sort: 'latest', status: 'completed' })
assert.deepEqual(nextMobileCatalogSelection('completed', 'rating', 'completed'), { sort: 'rating', status: 'all' })
assert.deepEqual(nextMobileCatalogSelection('title', 'popular', 'hiatus'), { sort: 'title', status: 'hiatus' })

const calls = []
let response = { data: [], error: null }
const query = new Proxy({}, { get: (_, name) => name === 'then' ? (resolve, reject) => Promise.resolve(response).then(resolve, reject) : (...args) => { calls.push([name, ...args]); return query } })
const service = load('src/services/exploreMobileService.ts', {
  './apiResilience': { withServiceTimeout: (operation, options) => { assert.ok(options.label); assert.equal(options.signal, signal); return operation(options.signal) } },
  zod: { z }, './supabase': { supabase: { from: name => { calls.push(['from', name]); return query } } },
  './userService/blocks': { getBlockedUserIds: async () => ['blocked'] },
  './mangaListService/shared': { MANGA_LIST_SELECT: 'test-select', mapDbMangaListRow: row => row },
})
const id = '11111111-1111-4111-8111-111111111111'
const signal = new AbortController().signal
response = { data: [{ manga_id: id }], error: null }
assert.deepEqual(await service.getExploreFollowedIds(id, [id], signal), [id])
assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'user_id' && c[2] === id))
assert.ok(calls.some(c => c[0] === 'in' && c[1] === 'manga_id' && c[2].length === 1))
await assert.rejects(service.getExploreFollowedIds('invalid', [id], signal))
await assert.rejects(service.getExploreFollowedIds(id, Array(61).fill(id), signal))
const beforeEmpty = calls.length
assert.deepEqual(await service.getExploreFollowedIds(id, [], signal), [])
assert.equal(calls.length, beforeEmpty)

calls.length = 0
response = { data: [{ id: 'hidden', owner_id: 'blocked' }, ...Array.from({ length: 6 }, (_, i) => ({ id: String(i), owner_id: 'ok' }))], error: null }
const lists = await service.getExploreLists(signal)
assert.equal(lists.length, 4)
assert.ok(lists.every(l => l.owner_id !== 'blocked'))
assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'is_public' && c[2] === true))
assert.ok(calls.some(c => c[0] === 'limit' && c[1] <= 8))

calls.length = 0
response = { data: { id, chapter_number: 2.5, fansub_id: id }, error: null }
assert.equal((await service.getExploreFirstChapter(id, signal)).chapter_number, 2.5)
for (const key of ['is_active', 'is_approved', 'manga.is_active', 'manga.is_approved']) assert.ok(calls.some(c => c[0] === 'eq' && c[1] === key && c[2] === true))
assert.ok(calls.some(c => c[0] === 'or' && c[1].startsWith('publish_at.is.null,publish_at.lte.')))
assert.ok(calls.some(c => c[0] === 'order' && c[1] === 'chapter_number' && c[2].ascending === true))
assert.ok(calls.some(c => c[0] === 'limit' && c[1] === 1))
assert.ok(calls.some(c => c[0] === 'abortSignal' && c[1] === signal))
response = { data: null, error: null }
assert.equal(await service.getExploreFirstChapter(id, signal), null)
response = { data: null, error: new Error('network') }
await assert.rejects(service.getExploreFirstChapter(id, signal), /network/)
await assert.rejects(service.getExploreLists(signal), /network/)
await assert.rejects(service.getExploreFollowedIds(id, [id], signal), /network/)
console.log('PASS mobile Explore: independent state/sort, bulk follow, blocked owners, bounded queries and published first chapter')
