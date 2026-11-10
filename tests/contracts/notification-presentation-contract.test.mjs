import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(relative, imports = {}) {
  const source = readFileSync(new URL('../../' + relative, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', output)(module, module.exports, name => {
    if (name === '@/i18n/activeLocale') return { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)) }
    if (name === './notificationMessageText') return { translateNotificationMessage: (text) => text }
    assert.ok(name in imports, `Unexpected dependency: ${name}`)
    return imports[name]
  })
  return module.exports
}
const slug = load('src/lib/slug.ts')
const reader = load('src/lib/readerV2Route.ts')
const routes = load('src/lib/routes.ts', { './slug': slug, './readerV2Route': reader })
const presentation = load('src/components/notifications/notificationPresentation.ts', { '@/lib/routes': routes })
const { safeNotificationPath, notificationDestination, notificationDateGroup, notificationTime, notificationText, notificationDisplayTitle, notificationDisplayMessage } = presentation

for (const unsafe of ['', 'https://example.com', '//example.com', '/\\example.com', '\\example.com', '../hesap', '/%2f%2fexample.com', '/%5cexample.com', '/%00admin', '/%0Aadmin', '/%7Fadmin', '/\tadmin', '/%ZZ', '/giris yap']) {
  assert.equal(safeNotificationPath(unsafe), null, `An untrusted path must be rejected: ${JSON.stringify(unsafe)}`)
}
assert.equal(safeNotificationPath('/kesfet?q=aksiyon#sonu'), '/kesfet?q=aksiyon#sonu')
assert.equal(safeNotificationPath('/manga/serinin%20ad%C4%B1'), '/manga/serinin%20ad%C4%B1')
assert.equal(safeNotificationPath('/a/../kesfet'), '/kesfet')

const mangaId = '11111111-1111-4111-8111-111111111111'
const fansubId = '22222222-2222-4222-8222-222222222222'
const chapterId = '33333333-3333-4333-8333-333333333333'
function notice(type, data) {
  return { id: chapterId, user_id: fansubId, type, data, title: 'Yeni bölüm', message: null, icon: null, is_read: false, created_at: '2020-09-08T09:00:00Z' }
}
for (const event of ['manga_chapter_release', 'fansub_new_chapter']) {
  const chapter = notice('follow', { event, manga_id: mangaId, fansub_id: fansubId, chapter_id: chapterId, chapter_number: 12.5, route_hint: `/oku/${mangaId}/12/${fansubId}` })
  assert.equal(notificationDestination(chapter), `/oku/${mangaId}/12.5/${fansubId}?surum=${chapterId}`, 'a reported fractional chapter and exact version must be used instead of an old/wrong route_hint')
}
assert.equal(notificationDestination(notice('follow', { event: 'manga_chapter_release', manga_id: mangaId, chapter_number: '85.25' })), `/oku/${mangaId}/85.25`)
for (const invalid of [NaN, Infinity, -2, 0, null, '', 'eighty five', true, [85]]) {
  assert.equal(notificationDestination(notice('follow', { event: 'fansub_new_chapter', manga_id: mangaId, chapter_number: invalid })), `/manga/${mangaId}`, `Invalid chapter data must not go to the reader: ${JSON.stringify(invalid)}`)
}
// External address redirects are rejected; an old community post id no longer produces a target.
assert.equal(notificationDestination(notice('mention', { post_id: 'post/with slash', route_hint: 'https://example.com' })), null)
assert.equal(notificationDestination(notice('mention', { postId: 'legacy-post' })), null, 'old post notifications were removed')
assert.equal(notificationDestination(notice('system', { route_hint: '/hesap/ayarlar#bildirimler' })), '/hesap/ayarlar#bildirimler')
assert.equal(notificationDestination(notice('system', { fansub_id: fansubId })), `/fansub/${fansubId}`)
assert.equal(notificationDestination(notice('follow', { actor_username: '@yasin' })), '/profil/yasin')
assert.equal(notificationDestination(notice('badge_earned', null), 'yasin solak'), '/profil/yasin%20solak')
assert.equal(notificationDestination(notice('system', { event: 'pending_content_created' })), '/admin')
assert.equal(notificationDestination(notice('system', { event: 'unknown', url: '//example.com' })), null)
assert.equal(notificationText(notice('system', { label: '  Başlık  ' }), 'label'), 'Başlık')
assert.equal(notificationText(notice('system', { label: 85 }), 'label'), '')
const release = notice('follow', { event: 'fansub_new_chapter', manga_title: 'One Piece', chapter_number: '918.00', fansub_name: 'Çeviri Ekibi' })
assert.equal(notificationDisplayTitle(release), 'One Piece 918. bölüm yayında')
assert.equal(notificationDisplayMessage(release), 'Çeviri Ekibi · Yeni bölüm')
assert.equal(notificationDisplayTitle({ ...release, data: { ...release.data, chapter_number: '918.50' } }), 'One Piece 918.5. bölüm yayında')
assert.equal(notificationDisplayTitle({ ...release, data: { ...release.data, chapter_number: true } }), release.title)
assert.equal(notificationDisplayTitle({ ...release, data: { ...release.data, manga_title: '' } }), release.title)
assert.equal(notificationDisplayTitle(notice('comment', { manga_title: 'One Piece', chapter_number: 918 })), 'Yeni bölüm')
assert.equal(notificationDisplayMessage({ ...release, message: 'Eski açıklama', data: { ...release.data, fansub_name: null } }), 'Eski açıklama')
assert.equal(notificationDisplayMessage(notice('system', { fansub_name: 'Çeviri Ekibi' })), null)

// A fixed Wednesday example over local day boundaries; independent of the running machine's time zone.
const now = new Date(2026, 8, 9, 12, 0, 0)
assert.equal(notificationDateGroup(new Date(2026, 8, 9, 0, 0, 0).toISOString(), now), 'Bugün')
assert.equal(notificationDateGroup(new Date(2026, 8, 8, 23, 59, 0).toISOString(), now), 'Dün')
assert.equal(notificationDateGroup(new Date(2026, 8, 7, 0, 0, 0).toISOString(), now), 'Bu hafta')
assert.equal(notificationDateGroup(new Date(2026, 8, 6, 23, 59, 0).toISOString(), now), 'Daha önce')
assert.equal(notificationDateGroup('invalid', now), 'Daha önce')
assert.equal(notificationTime(new Date(now.getTime() - 30_000).toISOString(), now.getTime()), 'Az önce')
assert.equal(notificationTime(new Date(now.getTime() - 120_000).toISOString(), now.getTime()), '2 dakika önce')
assert.equal(notificationTime(new Date(now.getTime() - 7_200_000).toISOString(), now.getTime()), '2 saat önce')
assert.equal(notificationTime('invalid', now.getTime()), '')
console.log('PASS notification presentation: safe internal paths, real fractional chapter/version, old posts and local date groups')
