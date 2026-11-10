import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
const require = createRequire(import.meta.url)
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8')
function load(path, dependencies = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('module', 'exports', 'require', code)(module, module.exports, name => (name === '@/i18n/activeLocale' ? { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)) } : undefined) || dependencies[name] || require(name === '@/i18n/router' ? 'react-router-dom' : name))
  return module.exports
}
const model = load('src/services/announcementV2/model.ts')
const id = 'b8f644ec-04e0-40b7-9980-c2e84e73da01'
const mentions = { [`user:${id}`]: { kind: 'user', id, title: '@okur', href: '/profil/okur' } }
assert.equal(model.announcementTextForEditor(`Merhaba @[user:${id}]`, mentions), 'Merhaba @okur')
assert.equal(model.announcementTextFromEditor('Merhaba **@okur**! @okurun', mentions), `Merhaba **@[user:${id}]**! @okurun`)
const valid = { ...model.newAnnouncementDraft(), title: 'Okuma buluşması', document: [{ type: 'text', text: 'Merhaba' }] }
assert.equal(model.draftSchema.safeParse(valid).success, true)
for (const url of ['javascript:alert(1)', '//example.com', '/\\example.com', 'data:text/html,hi', 'http://example.com', '/\nexample.com']) assert.equal(model.safeAnnouncementUrl(url), false, url)
for (const url of ['/manga/mavi-gece', 'https://example.com/news?q=ok']) assert.equal(model.safeAnnouncementUrl(url), true)
for (const patch of [
  { title: '' }, { document: [{ type: 'text' }] }, { document: [{ type: 'html', text: '<b>h</b>' }] },
  { document: [{ type: 'image', url: 'javascript:alert(1)', alt: 'Resim' }] },
  { document: [{ type: 'reference', kind: 'manga', id: 'yanlış' }] }, { audience: 'selected', recipients: [] },
  { document: Array.from({ length: 25 }, () => ({ type: 'text', text: 'Metin' })) },
  { endsAt: '2001-01-01T00:00:00Z' }, { kind: 'reward', action: { type: 'reward', value: 10000, maxClaims: 100000 }, endsAt: '2099-01-01T00:00:00Z' },
  { kind: 'invitation', action: { type: 'rsvp' } },
]) assert.equal(model.draftSchema.safeParse({ ...valid, ...patch }).success, false, JSON.stringify(patch))
const announcement = { id, title: 'Güvenli metin', document: [{ type: 'text', text: '**Kalın** ve ==vurgu== <script>alert(1)</script> @[user:b8f644ec-04e0-40b7-9980-c2e84e73da01]' }, { type: 'reference', kind: 'manga', id }],
  kind: 'news', action: { type: 'none' }, references: {}, startsAt: valid.startsAt, endsAt: null, priority: 0, revision: 1, response: null, reward: null }
const { AnnouncementContent } = load('src/components/announcements/AnnouncementContent.tsx', { '@/services/announcementV2': model, './AnnouncementMention': { AnnouncementMention: ({ reference }) => React.createElement('a', { href: reference.href }, reference.title) } })
const html = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/' }, React.createElement(AnnouncementContent, { announcement })))
assert.ok(html.includes('<strong>Kalın</strong>'))
assert.ok(html.includes('<mark'))
assert.ok(html.includes('&lt;script&gt;'))
assert.ok(!html.includes('<script>'))
assert.ok(html.includes('Bu içerik artık erişilebilir değil.'))
assert.ok(!html.includes('b8f644ec-04e0-40b7-9980-c2e84e73da01'))
const previewHtml = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/' }, React.createElement(AnnouncementContent, {
  preview: true, announcement: { ...announcement, references: { [`user:${id}`]: { kind: 'user', id, title: '@okur', href: '/profil/okur' }, [`manga:${id}`]: { kind: 'manga', id, title: 'Mavi Gece', href: '/manga/mavi-gece' } } },
})))
assert.ok(previewHtml.includes('@okur'))
assert.ok(previewHtml.includes('Mavi Gece'))
assert.ok(!previewHtml.includes('href='), 'A preview link must not leave the editing screen.')
let response = { data: [announcement], error: null }
const calls = []
const service = load('src/services/announcementV2/index.ts', {
  './model': model,
  './reportModel': load('src/services/announcementV2/reportModel.ts'),
  '../supabase': { supabase: { rpc: (name, params) => { calls.push({ name, params }); return response } } },
  '../apiResilience': { withAbortSignal: x => x, withServiceTimeout: work => work(new AbortController().signal) },
})
assert.deepEqual(await service.listAnnouncements({ home: true, limit: 3 }), [announcement])
assert.deepEqual(calls.at(-1), { name: 'announcement_feed', params: { p_id: null, p_home: true, p_offset: 0, p_limit: 3, p_kind: null } })
response = { data: null, error: { message: 'Bağlantı kurulamadı.' } }
await assert.rejects(service.listAnnouncements(), /Bağlantı kurulamadı/)
response = { data: [{ ...announcement, action: { type: 'link', label: 'Aç', url: 'javascript:alert(1)' } }], error: null }
await assert.rejects(service.listAnnouncements())
const count = calls.length
await assert.rejects(service.saveAnnouncement(id, 0, { ...valid, title: '' }))
assert.equal(calls.length, count)
response = { data: { success: true, alreadyClaimed: true }, error: null }
assert.equal((await service.respondToAnnouncement(id, 'claim')).alreadyClaimed, true)
assert.deepEqual(calls.at(-1).params, { p_id: id, p_action: 'claim' })
const actionsSql = read('supabase/migrations/20260917164636_announcement_v2_wallet_guard.sql')
assert.match(actionsSql, /for update/)
assert.match(actionsSql, /txid_current\(\)/)
assert.match(actionsSql, /result-array\['code','code_id'\]/)
assert.match(actionsSql, /to_jsonb\(before_row\)-'stones'-'updated_at'/)
assert.ok(!actionsSql.includes("set_config('request.path'"))
console.log('PASS announcement document/URL validation, safe render, API error, source parameters and reward contract')

// Old two-option records are read; identity and limits of new choices are kept.
const options = model.invitationChoiceIds.map((id, i) => ({ id, label: `Gün ${i + 1}` }))
assert.ok(model.actionSchema.safeParse({ type: 'rsvp' }).success)
assert.ok(model.actionSchema.safeParse({ type: 'rsvp', options }).success)
for (const choices of [[], [...options, options[0]], [options[0], options[0]], [{ id: 'other', label: 'Başka' }], [{ id: 'accepted', label: ' ' }], [{ id: 'accepted', label: 'x'.repeat(61) }]]) {
  assert.equal(model.actionSchema.safeParse({ type: 'rsvp', options: choices }).success, false)
}
const newConditions = [
  { type: 'profile_completed' }, { type: 'read_chapters', count: 10 }, { type: 'read_manga', id, count: 3 },
  { type: 'follow_manga_count', count: 2 }, { type: 'follow_fansub_count', count: 2 },
  { type: 'level', count: 10 }, { type: 'claimed_quests', count: 1 }, { type: 'fansub_member', id },
]
for (const condition of newConditions) assert.ok(model.rewardConditionSchema.safeParse(condition).success)
for (const condition of [{ type: 'level', count: 11 }, { type: 'read_chapters', count: 0 }, { type: 'read_manga', count: 1 }, { type: 'claimed_quests', count: 1.5 }, { type: 'fansub_member', id: 'bad' }]) assert.equal(model.rewardConditionSchema.safeParse(condition).success, false)
assert.equal(model.actionSchema.safeParse({ type: 'reward', value: 1, maxClaims: 1, conditions: [newConditions[0], newConditions[0]] }).success, false)
const { AnnouncementInvitation } = load('src/components/announcements/AnnouncementInvitation.tsx', {
  '@/services/announcementV2': model,
  '@/components/ui/button': { Button: props => React.createElement('button', props) },
  '@/services/toastService': { toast: {} },
})
const invite = { ...announcement, action: { type: 'rsvp', options }, response: 'option3' }
const lockedHtml = renderToStaticMarkup(React.createElement(AnnouncementInvitation, { announcement: invite, userId: id, preview: false }))
assert.ok(lockedHtml.includes('Gün 3'))
assert.ok(lockedHtml.includes('değiştirilemez'))
assert.ok(!lockedHtml.includes('type="radio"'))
assert.ok(!lockedHtml.includes('<button'))
const openHtml = renderToStaticMarkup(React.createElement(AnnouncementInvitation, { announcement: { ...invite, response: null }, userId: id, preview: false }))
assert.equal((openHtml.match(/type="radio"/g) || []).length, 4)
assert.ok(openHtml.includes('Yanıtımı kaydet'))
response = { data: { success: true, response: 'option4' }, error: null }
await service.respondToAnnouncement(id, 'option4')
assert.deepEqual(calls.at(-1).params, { p_id: id, p_action: 'option4' })
console.log('PASS new achievement conditions, four invite options, locked view of a saved response and response contract')

const { AnnouncementMention } = load('src/components/announcements/AnnouncementMention.tsx', {
  '@/components/common/UserHoverCard': {
    FansubHoverCard: props => React.createElement('div', { 'data-slug': props.slug, 'data-portal': props.portalClassName }, props.children),
    UserHoverCard: props => React.createElement('div', { 'data-username': props.username, 'data-portal': props.portalClassName }, props.children),
  },
})
const fansubMentionHtml = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/' }, React.createElement(AnnouncementMention, {
  reference: { kind: 'fansub', id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', title: 'Bulut Fansub', href: '/fansub/bulut-fansub' },
})))
assert.ok(fansubMentionHtml.includes('data-slug="bulut-fansub"'), 'A fansub with an old id must also resolve through its real slug.')
assert.ok(fansubMentionHtml.includes('pointer-events-auto'))
assert.ok(fansubMentionHtml.includes('href="/fansub/bulut-fansub"'))
