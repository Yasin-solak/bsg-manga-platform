import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8')
function load(p, require = () => { throw new Error('unexpected import') }, Image) {
  const module = { exports: {} }
  new Function('module', 'exports', 'require', 'Image', ts.transpileModule(read(p), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(module, module.exports, require, Image)
  return module.exports
}
const { settleAuthBootstrap } = load('src/contexts/settleAuthBootstrap.ts')
let revision = 0, calls = 0, resolve
let finished = false
const sync = () => { calls++; revision++; return new Promise(r => { resolve = r }) }
const boot = settleAuthBootstrap(sync, () => revision, () => true).then(() => { finished = true })
revision++ // Another session/sign-out event came while bootstrap was running.
resolve(); await Promise.resolve(); await Promise.resolve()
assert.equal(finished, false)
assert.equal(calls, 2)
resolve(); await boot
assert.equal(finished, true)
let active = true
const cancelled = settleAuthBootstrap(sync, () => revision, () => active)
active = false; revision++; resolve(); await cancelled
assert.equal(calls, 3)

let state = null, cleanup, effect
const images = []
class FakeImage {
  constructor() { images.push(this) }
  decode() { return Promise.resolve() }
}
const { useReadyHeroManga } = load('src/components/home/useReadyHeroManga.ts', name => {
  if (name === 'react') return { useState: () => [state, value => { state = value }], useEffect: callback => { effect = callback } }
  if (name.includes('optimizedPublicImageUrl')) return { optimizePublicImageUrl: src => src }
  if (name.includes('coverPlaceholder')) return { buildCoverPlaceholder: title => 'placeholder:' + title }
  throw new Error(name)
}, FakeImage)
const render = manga => { const shown = useReadyHeroManga(manga); cleanup?.(); cleanup = effect(); return shown }
assert.equal(render({ id: 'a', title: 'A', coverImage: 'a.webp' }), null)
await images[0].onload(); await Promise.resolve()
assert.equal(state.id, 'a')
assert.equal(render({ id: 'b', title: 'B', coverImage: 'b.webp' }).id, 'a')
const lateLoad = images[1].onload
render({ id: 'c', title: 'C', coverImage: 'c.webp' })
await lateLoad(); await Promise.resolve()
assert.equal(state.id, 'a') // A late B does not overwrite the C choice.
images[2].onerror()
assert.equal(images[2].src, 'placeholder:C')
await images[2].onload(); await Promise.resolve()
assert.equal(state.id, 'c')
const context = read('src/contexts/AuthContext.tsx')
const eventBlock = context.slice(context.indexOf('supabase.auth.onAuthStateChange((event)'))
assert.ok(eventBlock.indexOf("if (event === 'INITIAL_SESSION') return") < eventBlock.indexOf('syncRequestIdRef.current += 1'))
assert.match(context, /await settle\(\)/)
assert.match(read('src/pages/HomePage.tsx'), /heroLoading=\{authLoading \|\| heroLoading/)
assert.match(read('src/components/layout/AccountTopBarActions.tsx'), /aria-label=\{txa\('Hesap bilgileri yükleniyor'\)\}/)
console.log('PASS session bootstrap race, cancel, ready cover transition, late response and error cover')
