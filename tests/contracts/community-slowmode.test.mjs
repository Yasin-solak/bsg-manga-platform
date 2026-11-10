import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source=readFileSync(new URL('../../src/lib/communitySlowmode.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {slowmodeDeadline,slowmodeRemaining}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const deadline=slowmodeDeadline('2026-09-20T10:01:00Z','2026-09-20T10:00:00Z',1000)
assert.equal(deadline,61000)
assert.equal(slowmodeRemaining(deadline,1000),60)
assert.equal(slowmodeRemaining(deadline,60500),1)
assert.equal(slowmodeRemaining(deadline,61000),0)
assert.equal(slowmodeRemaining(deadline,90000),0)
assert.equal(slowmodeDeadline(null,'2026-09-20T10:00:00Z',4000),4000)
assert.equal(slowmodeDeadline('2026-09-20T09:59:00Z','2026-09-20T10:00:00Z',4000),4000)
assert.equal(slowmodeDeadline('2026-09-20T13:01:00+03:00','2026-09-20T10:00:00Z',1000),deadline)
console.log('PASS slow mode: server time, second rounding, tab return, expiry, exemption and time zone')
