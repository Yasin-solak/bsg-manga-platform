import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../../src/lib/communityLiveRefresh.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { createCommunityLiveRefresh } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
function setup() {
  let now = 0, id = 0, visible = true
  const timers = new Map(), calls = []
  const clock = { now: () => now, set: (run, ms) => { timers.set(++id, { run, at: now + ms }); return id }, clear: id => timers.delete(id) }
  function advance(ms) {
    const end = now + ms
    for (;;) {
      const next = [...timers.entries()].sort((a,b) => a[1].at-b[1].at)[0]
      if (!next || next[1].at > end) break
      now = next[1].at; timers.delete(next[0]); next[1].run()
    }
    now = end
  }
  const live = createCommunityLiveRefresh({ refresh: kind => calls.push([now, kind]), visible: () => visible, clock, pollMs: 30000, resumeMs: 200 })
  return { live, calls, advance, timers, hide: () => { visible = false }, show: () => { visible = true; live.wake() } }
}
{
  const t = setup()
  t.advance(100); t.live.connection(true); t.live.connection(true); t.advance(1100)
  assert.deepEqual(t.calls, [[100, 'full']], 'first subscription and start timer do not request two snapshots')
  t.advance(120000)
  assert.deepEqual(t.calls.slice(1).map(c => c[1]), ['activity','activity','activity','activity'])
  t.advance(30000)
  assert.equal(t.calls.at(-1)[1], 'full', 'lost structural signals are repaired in the periodic full check')
  t.live.invalidate(false)
  assert.equal(t.calls.at(-1)[1], 'full', 'a role/channel change does not wait for the period')
  t.live.dispose(); assert.equal(t.timers.size, 0)
}
{
  const t = setup()
  t.advance(1000); assert.equal(t.calls.length, 1, 'with no socket the HTTP start still works')
  t.advance(500); t.live.connection(true); t.live.invalidate(true); t.advance(200)
  assert.deepEqual(t.calls.map(c => c[1]), ['full','activity','full'], 'a gap in a late subscription cannot be accidentally forgotten by an activity signal')
  t.live.connection(false); t.live.wake(); t.live.connection(true); t.live.wake(); t.advance(199)
  assert.equal(t.calls.length, 3)
  t.advance(1); assert.equal(t.calls.length, 4, 'online and resubscribe merge into one repair request')
  t.live.dispose()
}
{
  const t = setup()
  t.hide(); t.live.connection(true); t.live.invalidate(); t.advance(65000)
  assert.deepEqual(t.calls, [], 'a hidden browser tab makes no periodic query')
  t.show(); t.advance(200); assert.deepEqual(t.calls, [[65200, 'full']])
  t.live.connection(false); t.live.connection(true); t.hide(); t.advance(200)
  assert.equal(t.calls.length, 1)
  t.show(); t.advance(200); assert.equal(t.calls.length, 2, 'a reconnect missed while hidden is repaired on return')
  t.live.dispose(); t.live.invalidate(); t.live.connection(true); t.live.wake(); t.advance(100000)
  assert.equal(t.calls.length, 2)
}
console.log('PASS community: single start, late subscription gap, merged reconnect, visibility and periodic permission/metadata check')
