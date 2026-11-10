import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { untranslate } from './i18n-source.mjs'

// Event archive + auto close: a scheduled job closes the event itself, gives the reward once
// (request key + row lock), writes fallback Coin once to those who already own it, saves the result
// to the archive. The archive is admin-only; no actions in the panel, read-only.
const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
const sql = read('supabase/migrations/20261008210000_site_events_archive.sql')

assert.match(sql, /revoke all on table public\.site_events from public, anon, authenticated;/, 'the archive table is closed to clients')
assert.match(sql, /cron\.schedule\('site-events-tick', '\*\/10 \* \* \* \*', 'select app_private\.site_events_tick\(\);'\)/, 'automatic close every 10 minutes')
assert.match(sql, /cron\.unschedule\(jobid\) from cron\.job where jobname = 'site-events-tick'/, 'a job recreated does not run twice')
assert.match(sql, /order by ends_at for update skip locked/, 'two jobs cannot close the same event')
assert.match(sql, /v_request uuid := md5\('site-event:' \|\| p_event\.slug \|\| ':' \|\| p_user_id::text\)::uuid;/, 'reward request key is event + user')
assert.match(sql, /return jsonb_build_object\('status', 'already_granted'\);/, 'a second reward is not given')
assert.match(sql, /price_source, granted, request_key\)/, 'the reward order is written with a request key')
assert.match(sql, /'event_reward'/, 'the reward is an event reward, not a sale')
assert.match(sql, /l\.source_kind = 'site_event_prize' and l\.source_ref = p_event\.slug \|\| ':' \|\| v_winner\.user_id::text/, 'fallback Coin once per user')
assert.match(sql, /\(v_grant ->> 'granted'\)::integer = 0 and v_fallback > 0/, 'fallback Coin only if no item could be given')
assert.match(sql, /"fallbackCoin": 3000/, 'fallback reward amount is in the record')
assert.match(sql, /s\.caught_at <= p_event\.ends_at and coalesce\(u\.is_banned, false\) = false/, 'catches after the end and banned users do not count')
assert.match(sql, /if not app_private\.is_admin\(\) then/, 'archive is admin only')
assert.match(sql, /revoke all on function app_private\.site_events_tick\(\) from public;/, 'the client cannot trigger the close')
assert.doesNotMatch(sql, /grant execute on function app_private\./, 'internal functions are not opened to clients')
assert.doesNotMatch(sql, /grant execute on function public\.admin_site_events\(\) to anon/)

const section = read('src/components/admin/games/AdminGamesSection.tsx')
assert.match(section, /\{ value: 'events', label: 'Etkinlikler'[,} ]/, 'Events tab in the panel')
assert.match(section, /<AdminEventArchive \/>/)
assert.match(read('src/services/siteEventsService.ts'), /supabase\.rpc\('admin_site_events'\)/)

console.log('PASS Event archive: automatic close, one-time reward, fallback Coin, admin-only archive')
