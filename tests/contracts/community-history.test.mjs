import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../../src/lib/communityMessageHistory.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { mergeCommunityMessages: merge, hasCommunityHistoryGap: gap } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const message = (seq, body = String(seq)) => ({ id: `message-${seq}`, seq: String(seq), body })

const updated = merge([message(9), message(10)], [message(10, 'düzenlendi'), message(11)])
assert.deepEqual(updated.map(m => m.seq), ['9', '10', '11'])
assert.equal(updated[1].body, 'düzenlendi')
assert.equal(merge(updated, [message(10, '')])[1].body, '')
const large = 9007199254740993n
assert.deepEqual(merge([message(large + 1n)], [message(large)]).map(m => m.seq), [String(large), String(large + 1n)])
assert.deepEqual(merge([message(1)], [message(60), message(61)]).map(m => m.seq), ['60', '61'])
assert.deepEqual(merge([message(1)], [message(2)]).map(m => m.seq), ['1', '2'])
const bounded = merge([], Array.from({ length: 300 }, (_, i) => message(i + 1)))
assert.equal(bounded.length, 250)
assert.equal(bounded[0].seq, '51')
assert.equal(bounded[249].seq, '300')
assert.deepEqual(merge(updated, []), updated)
assert.equal(gap([], [message(900)]), false)
assert.equal(gap([message(900)], []), false)
assert.equal(gap([message(900)], [message(901)]), false)
assert.equal(gap([message(900)], [message(960)]), true)
assert.equal(gap([message(large)], [message(large + 1n)]), false)
console.log('PASS community history: retry, edit/delete, bigint order, gap range and 250 message limit')
