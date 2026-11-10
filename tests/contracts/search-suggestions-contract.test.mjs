import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(relative, imports) {
  const source = readFileSync(new URL('../../' + relative, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', output)(module, module.exports, name => {
    if (name === '@/i18n/activeLocale') return { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)) }
    assert.ok(name in imports, `Unexpected dependency: ${name}`)
    return imports[name]
  })
  return module.exports
}
const calls = []
let response = { data: [], error: null }
const query = new Proxy({}, { get: (_, name) => name === 'then' ? (resolve, reject) => Promise.resolve(response).then(resolve, reject) : (...args) => { calls.push([name, ...args]); return query } })
const service = load('src/services/globalSearchService.ts', {
  '@/lib/routes': { buildPublicMangaPath: () => '/manga/test', buildPublicFansubPath: () => '/fansub/test' },
  '@/lib/coverPlaceholder': { buildCoverPlaceholder: () => '' },
  './communityMentionService/shared': { sanitizeLikeQuery: value => value.replace(/[%_,()]/g, '') },
  './supabase': { supabase: { from: name => { calls.push(['from', name]); return query } } },
  './apiResilience': { withAbortSignal: (request, signal) => request.abortSignal(signal) },
})
const signal = new AbortController().signal
assert.deepEqual(await service.searchGlobalEntities('a', 3, signal), { mangas: [], authors: [], fansubs: [], users: [] })
assert.equal(calls.length, 0, 'a single letter must not start a server query')
await service.searchGlobalEntities('x'.repeat(1000), 100, signal)
assert.equal(calls.filter(c => c[0] === 'abortSignal' && c[1] === signal).length, 3)
assert.ok(calls.filter(c => c[0] === 'limit').every(c => c[1] <= 16))
assert.ok(calls.some(c => c[0] === 'from' && c[1] === 'public_user_directory'))
assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'is_approved' && c[2] === true))
response = { data: [], error: { message: 'offline' } }
const warn = console.warn
console.warn = () => {}
try { assert.equal((await service.searchGlobalEntities('test', 3, signal)).partial, true) } finally { console.warn = warn }

// Small hook runner: real delay/cancel/response order; no DOM imitation.
let state, deps, cleanup, pendingEffect
const requests = []
let mode = 'pending'
const hook = load('src/components/search/useSearchSuggestions.ts', {
  react: {
    useState: initial => { state ??= initial; return [state, next => { state = next }] },
    useEffect: (effect, next) => { if (!deps || next.some((v, i) => v !== deps[i])) { cleanup?.(); deps = next; pendingEffect = effect } },
  },
  '@/services/mangaService': { listMangas: (params, requestSignal) => mode === 'error' ? Promise.reject(new Error('offline')) : new Promise(resolve => requests.push({ params, signal: requestSignal, resolve })) },
  '@/services/globalSearchService': { searchGlobalEntities: async () => ({ mangas: [], authors: [], fansubs: [], users: [] }) },
  '@/services/apiResilience': { withServiceTimeout: (operation, options) => operation(options.signal) },
})
globalThis.window = { setTimeout, clearTimeout }
function render(q, retry = 0) { const value = hook.useSearchSuggestions(q, retry); if (pendingEffect) { cleanup = pendingEffect(); pendingEffect = null } return value }
const tick = () => new Promise(resolve => setTimeout(resolve, 280))
const settle = () => new Promise(resolve => setImmediate(resolve))
render('ka'); render('kara'); await tick()
assert.equal(requests.length, 1, 'debounce must run only the last query')
assert.equal(requests[0].params.search, 'kara')
render('mavi'); assert.equal(requests[0].signal.aborted, true)
await tick()
requests[1].resolve({ data: [{ id: 'new' }], count: 1 }); await settle()
assert.equal(render('mavi').mangas[0].id, 'new')
requests[0].resolve({ data: [{ id: 'old' }], count: 1 }); await settle()
assert.equal(render('mavi').mangas[0].id, 'new', 'a late old response must not overwrite the new result')
assert.deepEqual(render('ma').mangas, [], 'no old result during debounce')
render('m'); await tick(); assert.equal(requests.length, 2, 'the request must cancel on returning to one letter')
mode = 'error'; render('offline'); await tick(); await settle()
assert.equal(render('offline').error, true, 'a connection error must not be an empty result')
mode = 'pending'; render('offline', 1); await tick()
requests[2].resolve({ data: [], count: 0 }); await settle()
assert.equal(render('offline', 1).error, false, 'retry must show the successful response')
cleanup?.()
delete globalThis.window
console.log('PASS search: debounce, old response, cancel, error/retry, bounded public queries')
