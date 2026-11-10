import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { activeLocaleShim } from './i18n-source.mjs'

function load(relative, imports = {}) {
  const source = readFileSync(new URL('../../' + relative, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', output)(module, module.exports, (name) => { if (name === '@/i18n/activeLocale') return activeLocaleShim;
    assert.ok(name in imports, `Unexpected dependency: ${name}`)
    return imports[name]
  })
  return module.exports
}

const model = load('src/services/notificationService/centerModel.ts', { zod: { z } })
const resilience = load('src/services/apiResilience.ts')
const owner = '11111111-1111-4111-8111-111111111111'
const otherOwner = '22222222-2222-4222-8222-222222222222'
const blocked = '33333333-3333-4333-8333-333333333333'
const id = number => `44444444-4444-4444-8444-${String(number).padStart(12, '0')}`
const timestamp = '2020-09-08T09:00:00.123456+00:00'
const cursor = { createdAt: timestamp, id: id(3) }
assert.match(model.notificationCursorFilter(cursor), /00\.123456\+00:00/)
assert.throws(() => model.notificationCursorFilter({ ...cursor, id: 'x),user_id.neq.any' }))
assert.throws(() => model.notificationCursorFilter({ ...cursor, createdAt: '2026-09-08),user_id.eq.x' }))
assert.throws(() => model.notificationActorFilters(['bad-id']))
assert.deepEqual(model.notificationActorFilters([]), [])
assert.equal(model.notificationActorFilters([blocked, blocked]).length, 5)
const timeCompare = model.compareNotificationTimestamps
assert.equal(timeCompare('2020-09-08T09:00:00.123999+00:00', '2020-09-08T09:00:00.123Z'), 1)
assert.equal(timeCompare('2020-09-08T09:00:00.123001+00:00', '2020-09-08T09:00:00.123000Z'), 1)
assert.equal(timeCompare('2020-09-08T12:00:00.123456+03:00', '2020-09-08T09:00:00.123456Z'), 0)
assert.equal(timeCompare('2020-09-08T04:00:00.123456-05:00', '2020-09-08T09:00:00.123456+00:00'), 0)
assert.equal(timeCompare('2020-09-08T09:00:00Z', '2020-09-08T09:00:00.000001Z'), -1)
assert.equal(timeCompare('1969-12-31T23:59:59.123456Z', '1969-12-31T23:59:59.123Z'), 1)
assert.equal(timeCompare('invalid', timestamp), null)
assert.equal(model.isNotificationAtOrBefore('2020-09-08T09:00:00.123999+00:00', '2020-09-08T09:00:00.123Z'), false)
assert.equal(model.isNotificationAtOrBefore('2020-09-08T12:00:00.123+03:00', '2020-09-08T09:00:00.123Z'), true)
assert.equal(model.isNotificationAtOrBefore('invalid', timestamp), false)
assert.equal(model.isNotificationAtOrBefore(timestamp, null), false)

const examples = [
  ['follow', { event: 'manga_chapter_release' }, 'chapter'],
  ['follow', { event: 'fansub_new_chapter' }, 'chapter'],
  ['system', { event: 'fansub_new_chapter' }, 'chapter'],
  ['mention', null, 'community'],
  ['comment', {}, 'community'],
  ['follow', { event: 'fansub_new_manga' }, 'community'],
  ['follow', { event: 'fansub_post' }, 'community'],
  ['system', { event: 'fansub_special_notification' }, 'community'],
  ['badge_earned', null, 'system'],
  ['badge_purchased', {}, 'system'],
  ['level_up', { event: 'unknown' }, 'system'],
  ['system', { event: 'comment_moderation_removed' }, 'system'],
  ['system', null, 'system'],
]

let rows = examples.map(([type, data], index) => ({
  id: id(index + 1), user_id: owner, type, data, title: `Bildirim ${index + 1}`,
  message: null, icon: null, is_read: index % 3 === 0, created_at: timestamp,
}))
rows.push({ ...rows[0], id: id(21), user_id: otherOwner, is_read: false })
for (const [index, key] of ['actor_user_id', 'sender_user_id', 'invited_by', 'requester_id', 'transferred_by'].entries()) {
  rows.push({ ...rows[3], id: id(30 + index), is_read: false, data: { [key]: blocked } })
}
// The recipient's identity should not read as the actor; old data stays visible with an empty event too.
rows.push({ ...rows[3], id: id(40), is_read: false, data: { user_id: blocked, event: null } })

function splitTopLevel(value) {
  const pieces = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++
    else if (value[i] === ')') depth--
    else if (value[i] === ',' && depth === 0) { pieces.push(value.slice(start, i)); start = i + 1 }
  }
  pieces.push(value.slice(start))
  return pieces
}

// The network mock applies SQL null logic and PostgREST composite filters.
function matches(row, expression) {
  if (expression.startsWith('and(')) return splitTopLevel(expression.slice(4, -1)).every(part => matches(row, part))
  if (expression.startsWith('or(')) return splitTopLevel(expression.slice(3, -1)).some(part => matches(row, part))
  const match = expression.match(/^([^.]+)\.(not\.in|in|is|eq|lt|lte)\.(.*)$/)
  assert.ok(match, `Unsupported filter: ${expression}`)
  const [, field, op, raw] = match
  const value = field.startsWith('data->>') ? row.data?.[field.slice(7)] ?? null : row[field]
  if (op === 'is') return raw === 'null' && value === null
  if (value === null || value === undefined) return false
  if (op === 'in' || op === 'not.in') {
    const includes = raw.slice(1, -1).split(',').includes(String(value))
    return op === 'in' ? includes : !includes
  }
  if (op === 'eq') return String(value) === raw
  const compare = field === 'created_at' ? Date.parse(value) - Date.parse(raw) || (value === raw ? 0 : value.localeCompare(raw)) : String(value).localeCompare(raw)
  return op === 'lt' ? compare < 0 : compare <= 0
}

const requests = []
let failNext = null
let activeSignal = null
const supabase = createClient('https://notifications.invalid', 'test-anon-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init = {}) => {
    const url = new URL(input)
    const method = init.method ?? 'GET'
    const headers = new Headers(init.headers)
    requests.push({ method, query: url.searchParams, headers, signal: init.signal, body: init.body })
    assert.ok(init.signal instanceof AbortSignal, 'every request must have a cancel signal')
    activeSignal = init.signal
    assert.equal(url.pathname, '/rest/v1/notifications')
    if (failNext) { const failure = failNext; failNext = null; return new Response(JSON.stringify({ message: failure }), { status: 503 }) }
    let found = rows.filter(row => [...url.searchParams.entries()].every(([field, value]) => {
      if (['select', 'order', 'limit'].includes(field)) return true
      return field === 'or' ? matches(row, `or${value}`) : matches(row, `${field}.${value}`)
    }))
    found.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    const count = found.length
    if (method === 'PATCH') {
      const changes = JSON.parse(init.body)
      found.forEach(row => Object.assign(row, changes))
    }
    if (url.searchParams.has('limit')) found = found.slice(0, Number(url.searchParams.get('limit')))
    const responseHeaders = { 'content-type': 'application/json', 'content-range': `0-${Math.max(0, found.length - 1)}/${count}` }
    if (headers.get('accept')?.includes('vnd.pgrst.object')) {
      if (found.length !== 1) return new Response(JSON.stringify({ code: 'PGRST116', message: 'Bildirim bulunamadı' }), { status: 406, headers: responseHeaders })
      return new Response(JSON.stringify(found[0]), { headers: responseHeaders })
    }
    if (method === 'HEAD' || (method === 'PATCH' && !headers.get('prefer')?.includes('return=representation'))) return new Response(null, { status: method === 'PATCH' ? 204 : 200, headers: responseHeaders })
    return new Response(JSON.stringify(found), { headers: responseHeaders })
  } },
})
let blockedFailure = null
let blockedIds = [blocked]
const service = load('src/services/notificationService/center.ts', {
  zod: { z }, '../apiResilience': resilience, '../supabase': { supabase },
  '../userService/blocks': { getBlockedUserIds: async (userId, signal) => {
    assert.equal(userId, owner)
    assert.ok(signal instanceof AbortSignal)
    if (blockedFailure) throw blockedFailure
    return blockedIds
  } },
  './shared': { mapNotification: row => row }, './centerModel': model,
  './centerEnrichment': { enrichNotificationPage: async rows => rows },
})
const visible = rows.filter(row => row.user_id === owner && (Number(row.id.slice(-12)) < 30 || row.id === id(40)))
const visibleExpected = [...visible].sort((a, b) => b.id.localeCompare(a.id)).map(row => row.id)
let nextCursor = null
let snapshotAt
const seen = []
do {
  const page = await service.getNotificationPage(owner, { limit: 2, cursor: nextCursor, snapshotAt })
  snapshotAt = page.snapshotAt
  nextCursor = page.nextCursor
  seen.push(...page.items.map(row => row.id))
} while (nextCursor)
assert.deepEqual(seen, visibleExpected, 'a record with equal microseconds must not be skipped or duplicated')
assert.equal(new Set(seen).size, seen.length)
assert.ok(requests.every(request => request.query.get('user_id') === `eq.${owner}`))
assert.ok(requests.every(request => request.query.get('order') === 'created_at.desc,id.desc'))
const snapshotRequests = requests.filter(request => request.query.get('select') === 'id,created_at')
assert.equal(snapshotRequests.length, 1, 'the first server time limit must not be regenerated in pagination')
assert.equal(snapshotRequests[0].query.get('limit'), '1')
assert.equal(snapshotRequests[0].query.has('or'), false, 'the read-all limit must not be narrowed by category or actor')
assert.ok(requests.filter(request => request.query.get('select') !== 'id,created_at').every(request => request.query.get('limit') === '3'))
assert.equal(snapshotAt, timestamp, 'the limit must keep the microseconds of the server record')

const ActualDate = globalThis.Date
try {
  for (const fakeNow of ['2001-01-01T00:00:00Z', '2041-01-01T00:00:00Z']) {
    globalThis.Date = class extends ActualDate {
      constructor(...args) { if (args.length) super(...args); else super(fakeNow) }
      static now() { return ActualDate.parse(fakeNow) }
    }
    const page = await service.getNotificationPage(owner)
    assert.equal(page.snapshotAt, timestamp, 'a device clock ahead/behind must not change the server limit')
    assert.deepEqual(new Set(page.items.map(row => row.id)), new Set(visibleExpected))
  }
} finally { globalThis.Date = ActualDate }

for (const category of ['chapter', 'community', 'system']) {
  const page = await service.getNotificationPage(owner, { category })
  const expected = visible.filter(row => model.getNotificationCategory(row) === category)
  assert.deepEqual(new Set(page.items.map(row => row.id)), new Set(expected.map(row => row.id)))
}
for (const [type, data, expected] of examples) assert.equal(model.getNotificationCategory({ type, data }), expected)
const unreadPage = await service.getNotificationPage(owner, { unreadOnly: true })
assert.ok(unreadPage.items.every(row => row.is_read === false))
assert.equal(unreadPage.items.length, visible.filter(row => !row.is_read).length)
const beforeCounts = requests.length
const counts = await service.getNotificationUnreadCounts(owner)
assert.equal(requests.length - beforeCounts, 3)
assert.ok(requests.slice(beforeCounts).every(request => request.method === 'HEAD' && request.headers.get('prefer') === 'count=exact'))
assert.equal(counts.all, counts.chapter + counts.community + counts.system)
for (const category of ['chapter', 'community', 'system']) assert.equal(counts[category], visible.filter(row => !row.is_read && model.getNotificationCategory(row) === category).length)

const own = rows.find(row => row.id === id(2))
assert.equal((await service.markNotificationRead(owner, own.id)).is_read, true)
assert.equal((await service.markNotificationRead(owner, own.id)).is_read, true, 'a repeated read must finish safely')
await assert.rejects(service.markNotificationRead(owner, id(21)), error => error.message === 'Bildirim bulunamadı')
assert.equal(rows.find(row => row.id === id(21)).is_read, false)
const newArrival = { ...rows[4], id: id(50), is_read: false, created_at: '2020-09-08T10:00:00.000000+00:00' }
rows.push(newArrival)
assert.equal((await service.getNotificationPage(owner, { category: 'chapter' })).snapshotAt, newArrival.created_at, 'a category change must not lower the bulk read limit to an old record')
const remaining = visible.filter(row => !row.is_read).length
assert.equal(await service.markNotificationCenterRead(owner, { snapshotAt: timestamp }), remaining)
assert.equal(newArrival.is_read, false, 'a notification arriving after the screenshot must be kept')
assert.equal(rows.find(row => row.id === id(21)).is_read, false)
assert.ok(rows.filter(row => Number(row.id.slice(-12)) >= 30 && Number(row.id.slice(-12)) < 40).every(row => !row.is_read))
assert.equal(await service.markNotificationCenterRead(owner, { snapshotAt: timestamp }), 0)
assert.equal(requests.at(-1).method, 'PATCH')
assert.equal(requests.at(-1).headers.get('prefer'), 'count=exact')
assert.equal(requests.at(-1).query.has('select'), false, 'a bulk update must not download thousands of rows')

// Blocked actors are excluded from bulk updates. After unblocking the new server response is authoritative.
blockedIds = []
const freshPage = await service.getNotificationPage(owner, { unreadOnly: true })
const revealed = freshPage.items.find(row => row.id === id(30))
assert.equal(revealed.is_read, false)
const readVersions = new Map([[own.id, 1]])
assert.equal(model.applyNotificationReadVersion(revealed, readVersions, readVersions).is_read, false)
assert.equal(await service.markNotificationCenterRead(owner, { snapshotAt: timestamp }), 5, 'a second bulk read with the same limit must also update newly visible records')
assert.equal((await service.getNotificationPage(owner)).items.find(row => row.id === id(30)).is_read, true)
assert.equal(newArrival.is_read, false)
blockedIds = [blocked]

// An old response cannot undo a new single success; a later query is not overwritten by an old success.
const unreadRow = { ...own, is_read: false }
const baseline = new Map()
const afterRead = new Map([[own.id, 1]])
assert.equal(model.applyNotificationReadVersion(unreadRow, baseline, afterRead).is_read, true)
assert.equal(model.applyNotificationReadVersion(unreadRow, afterRead, afterRead).is_read, false)
assert.equal(model.applyNotificationReadVersion(unreadRow, afterRead, new Map([[own.id, 2]])).is_read, true)
assert.equal(unreadRow.is_read, false)

const savedRows = rows
try {
  rows = []
  const emptyPage = await service.getNotificationPage(owner)
  assert.deepEqual(emptyPage.items, [])
  assert.equal(emptyPage.snapshotAt, '1970-01-01T00:00:00.000Z')
  rows = [{ ...newArrival, is_read: false }]
  assert.equal(await service.markNotificationCenterRead(owner, { snapshotAt: emptyPage.snapshotAt }), 0)
  assert.equal(rows[0].is_read, false, 'the first notification arriving after an empty screen opened must be kept')
} finally { rows = savedRows }

for (const operation of [
  () => service.getNotificationPage(owner), () => service.getNotificationUnreadCounts(owner),
  () => service.markNotificationRead(owner, own.id), () => service.markNotificationCenterRead(owner, { snapshotAt: timestamp }),
]) {
  failNext = 'Ağ erişimi başarısız'
  await assert.rejects(operation(), error => error.message === 'Ağ erişimi başarısız')
}
const beforeInvalid = requests.length
await assert.rejects(service.getNotificationPage('invalid'))
await assert.rejects(service.getNotificationPage(owner, { limit: 51 }))
await assert.rejects(service.getNotificationPage(owner, { category: 'other' }))
await assert.rejects(service.markNotificationRead(owner, 'invalid'))
assert.equal(requests.length, beforeInvalid)
blockedFailure = new Error('Privacy query failed')
await assert.rejects(service.getNotificationPage(owner), /Privacy query failed/)
assert.equal(requests.length, beforeInvalid, 'if the privacy filter cannot be read notifications must not be queried')
blockedFailure = null
const abort = new AbortController()
abort.abort()
await assert.rejects(service.getNotificationPage(owner, { signal: abort.signal }), error => error.name === 'AbortError')
assert.ok(activeSignal instanceof AbortSignal)

const imageRequests = []
let imageFailure = false
const imageClient = createClient('https://images.invalid', 'test-anon-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init = {}) => {
    const url = new URL(input)
    const table = url.pathname.split('/').pop()
    imageRequests.push({ table, query: url.searchParams, signal: init.signal })
    if (imageFailure) return new Response(JSON.stringify({ message: 'Görsel bulunamadı' }), { status: 503 })
    const data = table === 'mangas' ? [{ id: id(80), cover_image_url: '/cover.webp' }]
      : [{ id: id(table === 'fansubs' ? 81 : 82), avatar_url: '/avatar.webp' }]
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
  } },
})
const { enrichNotificationPage } = load('src/services/notificationService/centerEnrichment.ts', {
  '../apiResilience': resilience, '../supabase': { supabase: imageClient }, './centerModel': model,
  '../assetUrlService': { resolveSafeAssetUrl: value => value.startsWith('/') ? value : undefined },
})
const source = [
  { ...rows[0], data: { manga_id: id(80), fansub_id: id(81), actor_user_id: id(82) } },
  { ...rows[1], data: { manga_id: id(80), fansub_id: id(81), sender_user_id: id(82) } },
  { ...rows[2], data: { manga_id: id(80), manga_cover: '/original-cover.webp' } },
  { ...rows[3], data: { manga_id: 'invalid', actor_user_id: 'invalid' } },
]
const enriched = await enrichNotificationPage(source)
assert.equal(imageRequests.length, 3, 'one bulk query per page for each image type')
assert.ok(imageRequests.every(request => request.query.get('limit') === '50'))
assert.ok(imageRequests.every(request => request.signal instanceof AbortSignal))
const mangaQuery = imageRequests.find(request => request.table === 'mangas').query
assert.equal(mangaQuery.get('is_active'), 'eq.true')
assert.equal(mangaQuery.get('is_approved'), 'eq.true')
assert.equal(mangaQuery.get('id'), `in.(${id(80)})`, 'repeating series ids must be deduplicated')
assert.equal(enriched[0].data.manga_cover, '/cover.webp')
assert.equal(enriched[0].data.fansub_avatar, '/avatar.webp')
assert.equal(enriched[0].data.actor_avatar, '/avatar.webp')
assert.equal(enriched[1].data.actor_avatar, '/avatar.webp')
assert.equal(enriched[2].data.manga_cover, '/original-cover.webp')
assert.equal(source[0].data.manga_cover, undefined, 'the record object from the server must not be changed')
imageFailure = true
const failedImages = await enrichNotificationPage(source)
assert.equal(failedImages.length, source.length, 'on an image error notification history must be kept')
assert.equal(failedImages[0].data.manga_cover, undefined)
console.log('PASS notification center: category section, equal-time cursor, privacy, real PostgREST requests, recipient scope, bulk read cutoff and error propagation')
