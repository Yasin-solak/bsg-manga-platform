import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Old tab after deploy: a removed page chunk must move to the new version with a one-time reload
// instead of an error screen; no second reload in a short time (loop guard).
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function loadWithWindow(fakeWindow) {
  const exports = {}
  const code = ts.transpileModule(read('src/lib/staleChunkReload.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', 'window', code)(exports, fakeWindow)
  return exports
}

function fakeWindow({ storageThrows = false } = {}) {
  const store = new Map()
  const win = {
    reloads: 0,
    listeners: {},
    sessionStorage: {
      getItem: (key) => { if (storageThrows) throw new Error('blocked'); return store.get(key) ?? null },
      setItem: (key, value) => { if (storageThrows) throw new Error('blocked'); store.set(key, value) },
    },
    location: { reload: () => { win.reloads += 1 } },
    addEventListener: (type, fn) => { win.listeners[type] = fn },
  }
  return win
}

const win = fakeWindow()
const mod = loadWithWindow(win)

// Browser messages (Chrome / Firefox / Safari / MIME) are recognized; ordinary errors are not.
for (const message of [
  'Failed to fetch dynamically imported module: https://x/assets/ShopPage-abc.js',
  'error loading dynamically imported module',
  'Importing a module script failed.',
  "'text/html' is not a valid JavaScript MIME type.",
  'Unable to preload CSS for /assets/a.css',
]) {
  assert.equal(mod.isStaleChunkError(new Error(message)), true, message)
}
assert.equal(mod.isStaleChunkError(Object.assign(new Error('x'), { name: 'ChunkLoadError' })), true)
assert.equal(mod.isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'id')")), false)
assert.equal(mod.isStaleChunkError(null), false)

// Ilk seferde yenilenir, cooldown icinde ikinci kez yenilenmez, cooldown sonrasi yine yenilenir.
assert.equal(mod.reloadForStaleChunk(1_000_000), true)
assert.equal(win.reloads, 1)
assert.equal(mod.reloadForStaleChunk(1_010_000), false, 'loop guard: no repeat reload within 30 s')
assert.equal(win.reloads, 1)
assert.equal(mod.reloadForStaleChunk(1_040_000), true)
assert.equal(win.reloads, 2)

// Depolama kapaliysa cooldown tutulamaz: yenilemeyiz (sonsuz dongu riski).
const blocked = fakeWindow({ storageThrows: true })
assert.equal(loadWithWindow(blocked).reloadForStaleChunk(5), false)
assert.equal(blocked.reloads, 0)

// vite:preloadError is suppressed only when a reload starts.
const preloadWin = fakeWindow()
loadWithWindow(preloadWin).installStaleChunkReloadHandler()
let prevented = 0
preloadWin.listeners['vite:preloadError']({ preventDefault: () => { prevented += 1 } })
preloadWin.listeners['vite:preloadError']({ preventDefault: () => { prevented += 1 } })
assert.equal(prevented, 1)
assert.equal(preloadWin.reloads, 1)

// Connection points: lazy routes, the app entry and the error screen.
const lazyRoute = read('src/lib/lazyRoute.ts')
assert.match(lazyRoute, /isStaleChunkError\(error\) && reloadForStaleChunk\(\)/)
assert.match(lazyRoute, /lazy\(resilientLoader\)/)
assert.match(lazyRoute, /RouteComponent\.preload = resilientLoader/)
assert.match(read('src/main.tsx'), /installStaleChunkReloadHandler\(\)/)
const boundary = read('src/components/common/AppErrorBoundary.tsx')
assert.match(boundary, /const staleBuild = isStaleChunkError\(this\.state\.error\)/)
assert.match(boundary, /Site güncellendi\./)

console.log('PASS an old deploy chunk recovers with a one-time reload instead of an error screen')
