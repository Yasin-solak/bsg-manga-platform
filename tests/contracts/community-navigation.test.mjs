import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { inlineActiveLocale } from './i18n-source.mjs'
const source = readFileSync(new URL('../../src/lib/communityNavigation.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { resolveCommunityTarget, communityChannelPath } = await import(`data:text/javascript;base64,${Buffer.from(inlineActiveLocale(js)).toString('base64')}`)
const channels = [{ id: 'general' }, { id: 'series' }]
assert.equal(resolveCommunityTarget(channels, 'series').id, 'series')
assert.equal(resolveCommunityTarget(channels, 'private-or-deleted'), undefined)
assert.equal(resolveCommunityTarget(channels, null).id, 'general')
assert.equal(resolveCommunityTarget(channels, '', channels[1]).id, 'series')
assert.equal(resolveCommunityTarget([], null), undefined)
const path = communityChannelPath('server', 'series')
assert.equal(path, '/topluluk?sunucu=server&kanal=series')
const returnTo = `/giris?returnTo=${encodeURIComponent(path)}`
assert.equal(new URLSearchParams(returnTo.split('?')[1]).get('returnTo'), path)
console.log('PASS community links: selected target, no falling into the wrong chat on an unauthorized/deleted channel and sign-in return')
