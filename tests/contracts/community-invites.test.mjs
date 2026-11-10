import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { inlineActiveLocale } from './i18n-source.mjs'
const source = readFileSync(new URL('../../src/lib/communityInvites.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { createInviteToken, communityInvitePath, INVITE_DURATIONS } = await import(`data:text/javascript;base64,${Buffer.from(inlineActiveLocale(js)).toString('base64')}`)
const first = createInviteToken(), second = createInviteToken()
assert.match(first, /^[a-f0-9]{64}$/)
assert.notEqual(first, second)
assert.equal(new URL(communityInvitePath(first), 'https://bsgmanga.pages.dev').searchParams.get('davet'), first)
for (const invalid of ['', '../admin', first + '&sunucu=other', 'A'.repeat(64)]) assert.throws(() => communityInvitePath(invalid))
assert.equal(INVITE_DURATIONS.find(([v]) => v === 604800)?.[1], '7 gün')
console.log('PASS community invite: random share key, link target and invalid parameter rejection')
