import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { safeNotificationPath, resolvePushNotificationPath } from '../../functions/api/push/dispatch.js'

const listeners = {}
const navigations = []
const opened = []
let focused = 0
let clientList = []
const worker = vm.createContext({
  URL, Date, setTimeout, clearTimeout,
  self: {
    addEventListener: (type, handler) => { listeners[type] = handler },
    clients: {
      matchAll: async () => clientList,
      openWindow: async (url) => { opened.push(url) },
    },
  },
})
vm.runInContext(readFileSync('public/push-sw.js', 'utf8'), worker)

const unsafe = [
  'https://example.com', '//example.com', '/\\example.com', '/%2fexample.com',
  '/%5cexample.com', '/%252fexample.com', '/%25252fexample.com', '/%2525252525252fexample.com',
  '/\n/evil', '/%0a/evil', '/%250a/evil', '/a/..//example.com', '/a/%252e%252e//example.com',
  '/broken%encoding', 'javascript:alert(1)', '/x\\y', null, {},
]
for (const value of unsafe) {
  assert.equal(safeNotificationPath(value), null, `Dispatch must reject an external/targetless path: ${String(value)}`)
  assert.equal(worker.safeNotificationPath(value), null, `The SW must reject the same path: ${String(value)}`)
}
for (const value of ['/', '/bildirimler', '/oku/seri/85.5/ekip?surum=surum-1', '/manga/%C5%9Feker#yorumlar', '/discussion/post-1?yorum=2']) {
  assert.equal(safeNotificationPath(value), value)
  assert.equal(worker.safeNotificationPath(value), value)
}

assert.equal(resolvePushNotificationPath({
  url: '/oku/seri/84',
  data: { event: 'fansub_new_chapter', manga_id: 'seri', chapter_number: '85.5', fansub_id: 'ekip', chapter_id: 'surum-1' },
}), '/oku/seri/85.5/ekip?surum=surum-1', 'chapter and exact version must overwrite the old route hint.')
assert.equal(resolvePushNotificationPath({
  tag: 'manga_chapter_release',
  data: { manga_slug: 'seri', chapter_number: 12.5, chapter_id: 'surum-2' },
}), '/oku/seri/12.5?surum=surum-2', 'the chapter_id version must be kept even with an unknown fansub.')
assert.equal(resolvePushNotificationPath({ data: { route_hint: '/discussion/post-1' }, url: '/' }), '/discussion/post-1')
assert.equal(resolvePushNotificationPath({ route_hint: '//evil', url: '/fansub/ekip' }), '/fansub/ekip')
assert.equal(resolvePushNotificationPath({ url: '/%252fexample.com' }), '/')
assert.equal(resolvePushNotificationPath(null), '/')

async function click(url) {
  let completion
  listeners.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: (promise) => { completion = promise } })
  await completion
}

clientList = [{
  focus: async () => { focused += 1 },
  navigate: async (url) => {
    navigations.push(url)
    return { focus: async () => { focused += 1 } }
  },
}]
await click('/oku/seri/85.5/ekip?surum=surum-1')
assert.equal(navigations.at(-1), '/oku/seri/85.5/ekip?surum=surum-1')
await click('/')
assert.equal(navigations.at(-1), '/', 'a home target must also really navigate the open window.')
await click('//example.com')
assert.equal(navigations.at(-1), '/', 'a dangerous target in an old record must be rejected at click time too.')
assert.equal(focused, 3)
assert.equal(opened.length, 0)

clientList = [{ focus: async () => {}, navigate: async () => { throw new Error('Window closed') } }]
await click('/bildirimler')
assert.equal(opened.at(-1), '/bildirimler', 'a closed window must not lose delivery.')
clientList = []
await click('/%255cexample.com')
assert.equal(opened.at(-1), '/')

console.log('PASS push routing: local URL limit, decimal chapter/version and real SW click flow')
