import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8')
const compile = p => ts.transpileModule(read(p), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
const helper = { exports: {} }
new Function('module', 'exports', compile('src/contexts/settleAuthBootstrap.ts'))(helper, helper.exports)
const user = { id: 'profile-id', authUserId: 'auth-id', username: 'reader', birthDate: '2000-01-01', onboardingCompletedAt: '2026-01-01', stones: 42 }
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve() }
function harness() {
  const effects = [], states = [], requests = [], timers = []
  let listener
  const noop = () => undefined
  const mocks = new Proxy({}, { get: () => noop })
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState: initial => { const slot = { value: initial }; states.push(slot); return [initial, value => { slot.value = typeof value === 'function' ? value(slot.value) : value }] },
    useRef: current => ({ current }), useCallback: fn => fn, useEffect: fn => effects.push(fn),
  }
  const require = name => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx: noop }
    if (name === './settleAuthBootstrap') return helper.exports
    if (name === '@/services/authService') return { ...mocks, fetchCurrentUser: () => new Promise(resolve => requests.push(resolve)), isMfaRequiredError: () => false, isSessionReplacedError: () => false }
    if (name === '@/services/logger') return { createScopedLogger: () => mocks }
    if (name === '@/services/requestContext') return { createRequestContext: () => ({}), toRequestContextLogContext: () => ({}) }
    if (name === '@/services/supabase') return { supabase: { auth: {
      onAuthStateChange: callback => { listener = callback; callback('INITIAL_SESSION'); return { data: { authListener: null, subscription: { unsubscribe: noop } } } },
      getSession: async () => ({ data: { session: null }, error: null }),
    } } }
    return mocks
  }
  const module = { exports: {} }
  const window = { addEventListener: noop, removeEventListener: noop, setInterval: noop, clearInterval: noop, setTimeout: callback => timers.push(callback) }
  const document = { addEventListener: noop, removeEventListener: noop, visibilityState: 'visible' }
  new Function('module', 'exports', 'require', 'window', 'document', 'globalThis', compile('src/contexts/AuthContext.tsx'))(module, module.exports, require, window, document, {})
  module.exports.AuthProvider({ children: null })
  const bootstrap = effects.find(fn => fn.toString().includes('onAuthStateChange'))
  assert.ok(bootstrap)
  const cleanup = bootstrap()
  return { states, requests, event: event => listener(event), drainTimers: () => { while (timers.length) timers.shift()() }, cleanup }
}
const normal = harness()
assert.equal(normal.requests.length, 1)
normal.requests.shift()(user); await flush()
assert.equal(normal.states[0].value?.id, user.id)
assert.equal(normal.states[2].value, false)
assert.equal(normal.requests.length, 0) // INITIAL_SESSION did not cancel the first result.
normal.cleanup()

const logout = harness()
logout.event('SIGNED_OUT'); logout.drainTimers()
assert.equal(logout.states[0].value, null)
logout.requests.shift()(user); await flush()
assert.equal(logout.states[0].value, null) // A late response before sign-out does not reopen the account.
assert.equal(logout.states[2].value, false) // SIGNED_OUT is a definite result; no new query is needed.
for (let i = 0; i < 5 && logout.requests.length; i++) {
  logout.requests.shift()(null); await flush()
}
assert.equal(logout.states[0].value, null)
assert.equal(logout.states[2].value, false)
logout.cleanup()
const missing = harness()
missing.event('SIGNED_OUT') // fetchCurrentUser cleans up a missing session.
missing.requests.shift()(null); await flush(); missing.drainTimers(); await flush()
assert.equal(missing.requests.length, 0)
assert.equal(missing.states[2].value, false)
missing.cleanup()
const queued = harness()
queued.event('SIGNED_IN'); queued.event('SIGNED_OUT'); queued.drainTimers()
assert.equal(queued.requests.length, 1) // A sign-in job queued before sign-out does not run either.
queued.requests.shift()(user); await flush()
assert.equal(queued.states[0].value, null)
queued.cleanup()
console.log('PASS real AuthProvider bootstrap: INITIAL_SESSION keeps the first account; SIGNED_OUT rejects a late response and waits for the last decision')
