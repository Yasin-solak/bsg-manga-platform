import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../../src/lib/communityRefreshScheduler.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { createCommunityRefreshScheduler } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
let now = 0, next = 0, calls = 0
const jobs = new Map()
const clock = { set(callback, ms) { const id = next++; jobs.set(id, { at: now + ms, callback }); return id }, clear(id) { jobs.delete(id) } }
function tick(ms) {
  const end = now + ms
  for (;;) {
    const job = [...jobs.entries()].sort((a, b) => a[1].at - b[1].at)[0]
    if (!job || job[1].at > end) break
    now = job[1].at; jobs.delete(job[0]); job[1].callback()
  }
  now = end
}
const scheduler = createCommunityRefreshScheduler(() => calls++, 120, clock)
for (let i = 0; i < 24; i++) { scheduler.invalidate(); tick(10) }
assert.equal(calls, 2, 'a continuous signal must not starve the refresh')
for (let i = 0; i < 100; i++) scheduler.invalidate()
assert.equal(jobs.size, 1, 'one refresh in the same interval')
tick(120); assert.equal(calls, 3)
scheduler.invalidate(); scheduler.dispose(); tick(500)
scheduler.invalidate(); tick(500); assert.equal(calls, 3, 'a closed subscription cannot run')
console.log('PASS community refresh: continuous flow, merging, zero timer id and close')
