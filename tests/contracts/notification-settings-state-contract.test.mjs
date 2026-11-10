import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(relative, imports = {}) {
  const source = readFileSync(new URL('../../' + relative, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', output)(module, module.exports, name => {
    if (name === '@/i18n/activeLocale') return { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)) }
    assert.ok(name in imports, `Unexpected dependency: ${name}`)
    return imports[name]
  })
  return module.exports
}

function deferred() {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

// This driver does not test DOM/React display; it runs the real hook's promise races with a
// deterministic state/effect lifecycle. It does not match source code.
function createHookDriver() {
  const slots = []
  const effects = []
  let cursor = 0, mounted = true, dirty = true, hook, state, lateWrites = 0
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      const slot = slots[index]
      return [slot.value, update => {
        if (!mounted) { lateWrites++; return }
        const next = typeof update === 'function' ? update(slot.value) : update
        if (!Object.is(next, slot.value)) { slot.value = next; dirty = true }
      }]
    },
    useRef(initial) {
      const index = cursor++
      slots[index] ??= { current: initial }
      return slots[index]
    },
    useEffect(effect, dependencies) {
      const index = cursor++
      const previous = slots[index]
      const changed = !previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))
      if (!changed) return
      const slot = { dependencies, cleanup: previous?.cleanup }
      slots[index] = slot
      effects.push(() => { slot.cleanup?.(); slot.cleanup = effect() })
    },
  }
  function flush() {
    let renders = 0
    while (mounted && dirty) {
      assert.ok(++renders < 30, 'the hook must not enter an endless rerender loop')
      dirty = false; cursor = 0
      state = hook()
      effects.splice(0).forEach(effect => effect())
    }
  }
  return {
    react,
    get state() { return state },
    get lateWrites() { return lateWrites },
    mount(nextHook) { hook = nextHook; flush() },
    act(operation) { const result = operation(); flush(); return result },
    async drain() { await new Promise(resolve => setImmediate(resolve)); flush() },
    unmount() { mounted = false; slots.forEach(slot => slot.cleanup?.()) },
  }
}

const original = {
  followEnabled: true,
  commentEnabled: false,
  mentionEnabled: true,
  badgeEnabled: true,
  levelUpEnabled: false,
  systemEnabled: false,
}

function fixture() {
  const driver = createHookDriver()
  const reads = [], writes = [], messages = []
  const toastService = load('src/services/toastService.ts')
  const unsubscribe = toastService.subscribeToToast(message => messages.push(message))
  const { useNotificationSettingsState } = load('src/components/notifications/useNotificationSettingsState.ts', {
    react: driver.react,
    '@/services/toastService': toastService,
    '@/services/notificationService': {
      NOTIFICATION_PREFERENCE_KEYS: Object.keys(original),
      getMyNotificationPreferences: () => {
        const request = deferred(); reads.push(request); return request.promise
      },
      updateMyNotificationPreferences: preferences => {
        const request = { ...deferred(), payload: { ...preferences } }
        writes.push(request); return request.promise
      },
    },
  })
  driver.mount(useNotificationSettingsState)
  return {
    driver, reads, writes, messages,
    async ready(preferences = original) { reads.at(-1).resolve({ ...preferences }); await driver.drain() },
    close() { driver.unmount(); unsubscribe() },
  }
}

// A failed first read does not show as real preferences; retry and cancel do not write.
{
  const f = fixture()
  try {
    assert.equal(f.driver.state.loading, true)
    f.driver.act(() => f.driver.state.change('followEnabled', false))
    assert.equal(f.driver.state.draft, null)
    f.reads[0].reject(new Error('Temporary connection error'))
    await f.driver.drain()
    assert.equal(f.driver.state.loadError, true)
    assert.equal(f.driver.state.loading, false)
    assert.equal(f.driver.state.draft, null)
    f.driver.act(() => f.driver.state.retry())
    assert.equal(f.reads.length, 2)
    await f.ready()
    assert.deepEqual(f.driver.state.draft, original)
    assert.equal(f.driver.state.loadError, false)
    await f.driver.state.save()
    assert.equal(f.writes.length, 0, 'an unchanged preference must not be written again')
    f.driver.act(() => f.driver.state.change('followEnabled', false))
    assert.equal(f.driver.state.hasChanges, true)
    f.driver.act(() => f.driver.state.discard())
    assert.deepEqual(f.driver.state.draft, original)
    assert.equal(f.driver.state.hasChanges, false)
    assert.equal(f.writes.length, 0)
  } finally { f.close() }
}

// Two submissions in the same event must be one RPC; the draft cannot change while waiting.
{
  const f = fixture()
  try {
    await f.ready()
    f.driver.act(() => f.driver.state.change('followEnabled', false))
    const expectedDraft = { ...original, followEnabled: false }
    const pending = f.driver.act(() => [f.driver.state.save(), f.driver.state.save()])
    assert.equal(f.writes.length, 1)
    assert.equal(f.driver.state.saving, true)
    assert.deepEqual(f.writes[0].payload, expectedDraft)
    f.driver.act(() => { f.driver.state.change('commentEnabled', true); f.driver.state.discard() })
    assert.deepEqual(f.driver.state.draft, expectedDraft)
    assert.equal(f.messages.length, 0, 'no success notice before server confirmation')
    const confirmed = { ...expectedDraft, badgeEnabled: false }
    f.writes[0].resolve(confirmed)
    await Promise.all(pending); await f.driver.drain()
    assert.deepEqual(f.driver.state.draft, confirmed, 'the record returned by the server must be the basis')
    assert.equal(f.driver.state.hasChanges, false)
    assert.equal(f.driver.state.saving, false)
    assert.equal(f.messages.length, 1)
    assert.equal(f.messages[0].variant, 'success')
  } finally { f.close() }
}

// A rejected save does not lose the draft, does not change the saved baseline and can be resent.
{
  const f = fixture()
  try {
    await f.ready()
    f.driver.act(() => f.driver.state.change('systemEnabled', true))
    const draft = { ...original, systemEnabled: true }
    const pending = f.driver.act(() => f.driver.state.save())
    f.writes[0].reject(new Error('The save service is temporarily unavailable'))
    await pending; await f.driver.drain()
    assert.deepEqual(f.driver.state.draft, draft)
    assert.equal(f.driver.state.hasChanges, true)
    assert.equal(f.driver.state.saveError, true)
    assert.equal(f.driver.state.saving, false)
    assert.deepEqual(f.messages.map(message => message.variant), ['error'])
    f.driver.act(() => f.driver.state.discard())
    assert.deepEqual(f.driver.state.draft, original)
    f.driver.act(() => f.driver.state.change('systemEnabled', true))
    const retry = f.driver.act(() => f.driver.state.save())
    assert.equal(f.writes.length, 2)
    f.writes[1].resolve(draft)
    await retry; await f.driver.drain()
    assert.equal(f.driver.state.saveError, false)
    assert.equal(f.driver.state.hasChanges, false)
    assert.deepEqual(f.messages.map(message => message.variant), ['error', 'success'])
  } finally { f.close() }
}

// A late response of an earlier load should not overwrite newly reloaded preferences.
{
  const f = fixture()
  try {
    f.driver.act(() => f.driver.state.retry())
    const latest = { ...original, commentEnabled: true }
    f.reads[1].resolve(latest)
    await f.driver.drain()
    f.reads[0].resolve(original)
    await f.driver.drain()
    assert.deepEqual(f.driver.state.draft, latest)
  } finally { f.close() }
}

// On account/window change old read and save responses should not write toast or state to the new screen.
for (const operation of ['load', 'save']) {
  for (const outcome of ['resolve', 'reject']) {
    const f = fixture()
    try {
      let pending
      if (operation === 'save') {
        await f.ready()
        f.driver.act(() => f.driver.state.change('followEnabled', false))
        pending = f.driver.act(() => f.driver.state.save())
      }
      const request = operation === 'load' ? f.reads[0] : f.writes[0]
      f.driver.unmount()
      request[outcome](outcome === 'resolve' ? original : new Error('Late response error'))
      await pending; await f.driver.drain()
      assert.equal(f.driver.lateWrites, 0, `${operation}/${outcome}: no state write to a closed hook`)
      assert.equal(f.messages.length, 0, `${operation}/${outcome}: no notice from the old account`)
    } finally { f.close() }
  }
}

console.log('PASS notification preferences: retry, draft, single save, error integrity and late responses')
