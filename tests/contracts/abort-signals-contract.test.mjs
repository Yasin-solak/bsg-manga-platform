import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const source = readFileSync(path.join(rootDir, 'src/lib/abortSignals.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

function load(abortSignalImpl) {
  const exports = {}
  new Function('exports', 'AbortSignal', 'DOMException', code)(exports, abortSignalImpl, DOMException)
  return exports
}

// Simulate Safari < 17.4: no AbortSignal.any / AbortSignal.timeout statics.
const { anyAbortSignal, timeoutSignal, abortSignals } = load({ any: undefined, timeout: undefined })

const a = new AbortController()
const b = new AbortController()
const combined = anyAbortSignal([a.signal, b.signal])
assert.equal(combined.aborted, false)
const reason = new Error('boom')
b.abort(reason)
assert.equal(combined.aborted, true)
assert.equal(combined.reason, reason, 'fallback propagates the abort reason')

// Listeners are removed from every input once one of them fired.
let removed = 0
const fakeSignal = () => ({ aborted: false, reason: 'r', listeners: [], addEventListener(_t, l) { this.listeners.push(l) }, removeEventListener() { removed += 1 } })
const s1 = fakeSignal()
const s2 = fakeSignal()
anyAbortSignal([s1, s2])
s1.listeners[0]()
assert.equal(removed, 2, 'fallback removes its listeners after aborting')

// An input that is already aborted aborts the result immediately.
const pre = new AbortController()
pre.abort('early')
assert.equal(anyAbortSignal([pre.signal, new AbortController().signal]).reason, 'early')

// Native implementations are preferred when present.
let nativeCalls = 0
const native = load({
  any: (signals) => { nativeCalls += 1; return signals[0] },
  timeout: () => { nativeCalls += 1; return null },
})
native.anyAbortSignal([a.signal])
native.timeoutSignal(5)
assert.equal(nativeCalls, 2)

// Fallback timeout aborts with a TimeoutError.
const timed = timeoutSignal(5)
await new Promise((resolve) => setTimeout(resolve, 30))
assert.equal(timed.aborted, true)
assert.equal(timed.reason.name, 'TimeoutError')

// The namespace form keeps the timeout visible to the deep-audit timeout detection.
assert.equal(abortSignals.timeout, timeoutSignal)
assert.equal(abortSignals.any, anyAbortSignal)

// Nothing under src/ may call the unsupported statics directly.
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}
for (const file of walk(path.join(rootDir, 'src')).filter((f) => /\.(ts|tsx)$/.test(f))) {
  if (file.replace(/\\/g, '/').endsWith('src/lib/abortSignals.ts')) continue
  assert.doesNotMatch(readFileSync(file, 'utf8'), /AbortSignal\.(any|timeout)\(/, `${file} must use src/lib/abortSignals`)
}

console.log('PASS AbortSignal.any/timeout have fallbacks for older Safari')
