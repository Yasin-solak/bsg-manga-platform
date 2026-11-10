import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { handleAnnouncementImageUpload } from '../../functions/_shared/storage-upload-announcement-image.js'

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
const reward = { type: 'reward', value: 10, maxClaims: 20, conditions: [{ type: 'verified_email' }, { type: 'account_age', days: 7 }, { type: 'follow_manga', id }] }
assert.equal(model.actionSchema.safeParse(reward).success, true)
for (const conditions of [[{ type: 'account_age', days: 0 }], [{ type: 'account_age', days: 1.5 }], [{ type: 'verified_email', bypass: true }], [{ type: 'premium' }, { type: 'premium' }], [{ type: 'follow_manga', id: 'not-id' }]]) {
  assert.equal(model.actionSchema.safeParse({ ...reward, conditions }).success, false)
}
assert.equal(model.actionSchema.safeParse({ type: 'link', label: 'Aç', url: '/kesfet', direct: true }).success, true)
assert.equal(model.actionSchema.safeParse({ type: 'link', label: 'Aç', url: 'javascript:alert(1)', direct: true }).success, false)
const { mentionAtCursor } = model
assert.deepEqual(mentionAtCursor('Merhaba @ya', 11), { start: 8, end: 11, query: 'ya' })
assert.deepEqual(mentionAtCursor('@', 1), { start: 0, end: 1, query: '' })
assert.equal(mentionAtCursor('mail@example.com', 16), null)
assert.equal(mentionAtCursor('@okur bitti', 11), null)
const { AnnouncementSummary } = load('src/components/announcements/AnnouncementsPanel.tsx', {
  '@/components/ui/dialog': {}, '@/components/ui/button': {}, '@/contexts/AuthContext': { useAuth: () => ({ currentUser: null }) },
  '@/services/announcementV2': model, './AnnouncementContent': { AnnouncementInlineText: ({ text }) => text }, './AnnouncementActions': {}, './useAnnouncements': {},
})
const a = { id, title: 'Yeni seri', startsAt: '2026-09-17T00:00:00Z', kind: 'news', priority: 0, document: [{ type: 'text', text: 'Hemen incele' }], references: {}, action: { type: 'link', label: 'İncele', url: '/kesfet', direct: true } }
const html = item => renderToStaticMarkup(React.createElement(StaticRouter, { location: '/' }, React.createElement(AnnouncementSummary, { item, onOpen: () => {} })))
assert.match(html(a), /<a[^>]+href="\/kesfet"/)
assert.ok(!html(a).includes('<button'))
assert.match(html({ ...a, action: { ...a.action, direct: false } }), /<button/)
assert.match(html({ ...a, action: { ...a.action, url: 'https://example.com' } }), /rel="noopener noreferrer"/)

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aP0AAAAASUVORK5CYII=', 'base64')
const form = (file, key = id) => { const f = new FormData(); f.set('announcementId', key); f.set('file', file); return f }
const writes = []
const env = { VITE_STORE_ASSET_PUBLIC_BASE_URL: 'https://assets.example.com', STORE_ASSETS_BUCKET: { put: async (...args) => writes.push(args) } }
const admin = { profile: { role: 'admin' } }
await assert.rejects(handleAnnouncementImageUpload({ profile: { role: 'user' } }, env, form(new File([png], 'image.png'))), e => e.status === 403)
await assert.rejects(handleAnnouncementImageUpload(admin, env, form(new File(['<svg/>'], 'image.png', { type: 'image/png' }))), e => e.status === 400)
await assert.rejects(handleAnnouncementImageUpload(admin, env, form(new File([png], 'image.png'), '../other')), e => e.status === 400)
await assert.rejects(handleAnnouncementImageUpload(admin, env, form(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'image.png'))), e => e.status === 400)
assert.equal(writes.length, 0)
const response = await handleAnnouncementImageUpload(admin, env, form(new File([png], 'unsafe.html', { type: 'text/html' })))
assert.equal(response.status, 200)
const payload = await response.json()
assert.match(payload.objectPath, new RegExp(`^announcements/${id}/[a-f0-9-]+\\.png$`))
assert.equal(payload.publicUrl, `https://assets.example.com/${payload.objectPath}`)
assert.equal(writes[0][2].httpMetadata.contentType, 'image/png')
console.log('PASS announcement conditions, @ parsing, direct link, R2 permission/size/content and safe object path')
