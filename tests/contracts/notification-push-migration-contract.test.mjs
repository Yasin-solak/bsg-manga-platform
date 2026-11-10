import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolvePushNotificationPath } from '../../functions/api/push/dispatch.js'

const migration = readFileSync('supabase/migrations/20260908191740_web_push_notification_routing.sql', 'utf8')
const sql = migration.replace(/--[^\n]*/g, '')
assert.match(sql, /create or replace function private\.dispatch_web_push_notification\(\)/)
assert.match(sql, /security definer\s+set search_path = ''/)
assert.match(sql, /dispatch_url = 'https:\/\/example\.com\/api\/push\/dispatch'/)
assert.match(sql, /url := 'https:\/\/example\.com\/api\/push\/dispatch'/)
assert.doesNotMatch(sql, /url := cfg\.dispatch_url/)
assert.match(sql, /where id is true and is_enabled/)
assert.match(sql, /event_key = any \(cfg\.event_allowlist\)/)
assert.match(sql, /where s\.user_id = new\.user_id/)
assert.match(sql, /pg_catalog\.pg_extension where extname = 'pg_net'/)
assert.match(sql, /exception when others then\s+return new/)
assert.doesNotMatch(sql, /\b(?:insert into|update|alter table|grant|revoke|create policy|drop policy)\b/i, 'a route fix must not change config, flag and subscription permissions')

// SQL's explicit JSON allowlist is tested together with CF's real routing resolver.
const fields = [...sql.matchAll(/'([a-z_]+)', new\.data -> '([a-z_]+)'/g)].map(([, key, source]) => {
  assert.equal(key, source)
  return key
})
assert.deepEqual(fields, ['event', 'route_hint', 'url', 'manga_id', 'manga_slug', 'chapter_number', 'chapter_id', 'fansub_id', 'fansub_slug'])
assert.match(sql, /'data', routing_data/)
assert.doesNotMatch(sql, /'data',\s*new\.data/, 'the whole notification metadata object must not go to the delivery endpoint')
function payload(data, type = 'follow') {
  return {
    title: 'Yeni bölüm', body: 'Serinin yeni bölümü yayımlandı.', url: typeof data?.url === 'string' ? data.url : '/',
    tag: data?.event ?? type,
    data: Object.fromEntries(fields.filter(key => data?.[key] != null).map(key => [key, data[key]])),
  }
}
const chapter = payload({
  event: 'fansub_new_chapter', manga_id: 'seri', fansub_id: 'ekip', chapter_number: 85.5,
  chapter_id: 'surum-85-5', route_hint: '/oku/seri/84', private_note: 'yalnız uygulama içi',
  email: 'fixture@example.invalid', arbitrary: { omitted: true },
})
assert.equal(typeof chapter.data.chapter_number, 'number')
assert.equal(resolvePushNotificationPath(chapter), '/oku/seri/85.5/ekip?surum=surum-85-5')
for (const field of ['private_note', 'email', 'arbitrary']) assert.equal(field in chapter.data, false)
assert.equal(resolvePushNotificationPath(payload({ event: 'manga_chapter_release', manga_slug: 'seri', chapter_number: '12.25', chapter_id: 'surum-12-25' })), '/oku/seri/12.25?surum=surum-12-25')
assert.equal(resolvePushNotificationPath(payload({ event: 'store_gift_received', route_hint: '/hesap?sekme=envanter' })), '/hesap?sekme=envanter')
assert.equal(resolvePushNotificationPath(payload({ event: 'store_gift_received', route_hint: '//example.invalid', url: '/bildirimler' })), '/bildirimler')
assert.equal(resolvePushNotificationPath(payload({ route_hint: '/%252fexample.invalid', url: 'https://example.invalid' }, 'system')), '/')
assert.equal(resolvePushNotificationPath(payload(null, 'system')), '/')
console.log('PASS push SQL contract: exact delivery target, metadata allowlist and real CF chapter/route priority')
