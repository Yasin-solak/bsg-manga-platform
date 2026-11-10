import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { inlineActiveLocale } from './i18n-source.mjs'
const source = readFileSync(new URL('../../src/lib/communityMentions.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { encodeCommunityMentions: encode, decodeCommunityMentions: decode, splitCommunityMentions: split, activeCommunityMention: active } = await import(`data:text/javascript;base64,${Buffer.from(inlineActiveLocale(js)).toString('base64')}`)
const user = { kind: 'user', id: '11111111-2222-4333-8444-555555555555', label: 'okur' }
const longer = { ...user, id: '22222222-2222-4333-8444-555555555555', label: 'okurlar' }
const role = { kind: 'role', id: '33333333-2222-4333-8444-555555555555', label: 'Çeviri (Ekibi)+' }
const token = `<@${user.id}>`, roleToken = `<@&${role.id}>`
assert.equal(encode('Merhaba @okur, @{Çeviri (Ekibi)+}!', [user, role]), `Merhaba ${token}, ${roleToken}!`)
assert.equal(encode('@okurlar @okur', [user, longer]), `<@${longer.id}> ${token}`)
assert.equal(encode('posta@okur.example @okurlar', [user]), 'posta@okur.example @okurlar')
assert.equal(encode('@okur @okur', [user]), `${token} ${token}`)
assert.equal(encode('@okur', []), '@okur')
assert.equal(decode(`${token} ${roleToken}`, [user, role]), '@okur @{Çeviri (Ekibi)+}')
assert.equal(decode('<script>alert(1)</script>', []), '<script>alert(1)</script>')
assert.equal(split(token, [user])[0].mention.id, user.id)
assert.equal(decode(token, []), '@erişilemeyen-etiket')
assert.deepEqual(active('Merhaba @oku', 12), { search: 'oku', start: 8, end: 12 })
assert.equal(active('posta@okur', 10), null)
assert.equal(active('@{Çeviri}', 9), null)
assert.deepEqual(active('@', 1), { search: '', start: 0, end: 1 })
assert.equal(decode(encode('😀 @okur bir öneri', [user]), [user]), '😀 @okur bir öneri')
console.log('PASS community mentions: selection, limits, clashing names, role text, Unicode, safe text and conversion')
