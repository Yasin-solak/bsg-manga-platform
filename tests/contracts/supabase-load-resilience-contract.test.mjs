import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Pins the 2026-11 load-resilience hardening: hot database paths must stay bounded under traffic
// spikes and abuse, without changing what each audience is allowed to see.

const read = (path) => readFileSync(path, 'utf8')
const migrations = 'supabase/migrations/'

// 1. Follower release notifications are set-based, keep push_notification's rules and fall back safely.
const followSql = read(`${migrations}20261116100000_follow_notifications_set_based.sql`)
const helperBody = followSql.slice(
  followSql.indexOf('create or replace function app_private.push_follow_notifications'),
  followSql.indexOf('create or replace function public.notify_chapter_release_to_followers'),
)
assert.match(helperBody, /insert into public\.notifications \(user_id, type, title, message, icon, data\)\s+select/i,
  'followers must be notified with one set-based insert')
assert.match(helperBody, /u\.is_active = true/i, 'only active users may be notified')
assert.match(helperBody, /public\.is_notification_type_enabled\(u\.id, 'follow'\)/i,
  'the follow notification preference must be respected')
assert.match(helperBody, /n\.data \? 'event_key'\s+and n\.data ->> 'event_key' = p_event_key_prefix \|\| u\.id::text/i,
  'event_key de-duplication must stay (and match the partial index predicate)')
assert.match(helperBody, /exception\s+when others then[\s\S]*?foreach v_follower_id in array p_follower_ids loop\s+perform public\.push_notification\(/i,
  'a failing bulk insert must fall back to the per-user path instead of blocking the release')
assert.match(followSql, /revoke execute on function app_private\.push_follow_notifications\(uuid\[\], text, text, jsonb, text\) from public, anon, authenticated;/i,
  'the helper must not be callable by API roles')
for (const triggerFunction of [
  'notify_chapter_release_to_followers',
  'notify_fansub_chapter_release_to_followers',
  'notify_fansub_manga_release_to_followers',
]) {
  const start = followSql.indexOf(`create or replace function public.${triggerFunction}()`)
  assert.ok(start > 0, `${triggerFunction} must be redefined`)
  const body = followSql.slice(start, followSql.indexOf('$function$;', start))
  assert.match(body, /perform app_private\.push_follow_notifications\(/i, `${triggerFunction} must use the set-based helper`)
  assert.doesNotMatch(body, /for v_follower_user_id in/i, `${triggerFunction} must not loop over followers`)
}

// 2. Anonymous homepage snapshots: computed under anon RLS, unreachable for writes from the API.
const snapshotSql = read(`${migrations}20261116100100_anon_home_snapshots.sql`)
assert.match(snapshotSql, /revoke all on table app_private\.anon_rpc_snapshots from public, anon, authenticated;/i,
  'API roles must not touch the snapshot table directly')
const refreshBody = snapshotSql.slice(snapshotSql.indexOf('create or replace function app_private.refresh_anon_home_snapshots()'))
assert.match(refreshBody, /set local role anon;[\s\S]*?homepage_feed_live\([\s\S]*?home_discussion_highlights_live\([\s\S]*?reset role;/i,
  'snapshots must be computed under the anon role so RLS (e.g. mature content) applies')
assert.match(refreshBody, /set_config\('request\.jwt\.claims', '\{"role":"anon"\}', true\)/i,
  'the refresh must carry the anon JWT role claim, like a real anonymous request')
const refreshFunction = refreshBody.slice(0, refreshBody.indexOf('$function$;'))
assert.doesNotMatch(refreshFunction, /security definer/i, 'the refresh must not run with definer rights')
for (const table of ['mangas', 'fansubs', 'site_announcements']) {
  assert.match(snapshotSql,
    new RegExp(`on public\\.${table}\\s+for each statement execute function app_private\\.invalidate_anon_home_snapshots\\(\\)`, 'i'),
    `hiding content in ${table} must drop the snapshots instead of waiting for the next refresh`)
}
assert.match(snapshotSql, /revoke execute on function app_private\.refresh_anon_home_snapshots\(\) from public, anon, authenticated;/i,
  'API roles must not be able to refresh (and so shape) the snapshot')
assert.match(snapshotSql, /cron\.schedule\('anon-home-snapshots', '\*\/5 \* \* \* \*'/i, 'the snapshot must be refreshed by cron')
for (const wrapper of ['get_homepage_feed', 'get_home_discussion_highlights']) {
  const start = snapshotSql.indexOf(`create or replace function public.${wrapper}(`)
  assert.ok(start > 0, `${wrapper} must be redefined`)
  const body = snapshotSql.slice(start, snapshotSql.indexOf('$function$;', start))
  assert.match(body, /if current_user = 'anon'/i, `${wrapper} may serve the snapshot to anonymous callers only`)
  assert.match(body, /read_anon_rpc_snapshot\('[^']+', 900\)/i, `${wrapper} must ignore snapshots older than 15 minutes`)
  assert.doesNotMatch(body, /security definer/i, `${wrapper} must stay security invoker`)
}

// 3. Anonymous-callable popular list is bounded.
const popularSql = read(`${migrations}20261116100200_popular_mangas_window_bounds.sql`)
assert.match(popularSql, /greatest\(least\(coalesce\(p_days, 7\), 90\), 1\)/i, 'the window must be capped at 90 days')
assert.match(popularSql, /limit greatest\(least\(coalesce\(p_limit, 0\), 100\), 0\)/i, 'the row count must be capped at 100')

// 4. Retention: logs and anonymous trackers are trimmed; signed-in trackers stay (announcement conditions count them).
const retentionSql = read(`${migrations}20261116100300_retention_jobs.sql`)
assert.match(retentionSql, /delete from cron\.job_run_details where end_time < now\(\) - interval '7 days'/i)
assert.match(retentionSql, /select public\.prune_activity_events\(\)/i)
assert.match(retentionSql, /delete from public\.manga_read_trackers where reader_key like 'anon:%'/i,
  'only anonymous read trackers may be pruned')

// 5. Anonymous read cap, without weakening the counter guard.
const trackSql = read(`${migrations}20261116100400_track_manga_read_anon_cap.sql`)
assert.match(trackSql, /if v_user_id is null then[\s\S]*?limit 120[\s\S]*?>= 120[\s\S]*?limit 1200[\s\S]*?>= 1200/i,
  'anonymous reads must be capped per series and site-wide')
assert.match(trackSql, /set_config\('app\.manga_read_counter_update', 'true', true\)/i)
assert.match(trackSql, /set_config\('app\.manga_read_counter_update', '', true\)/i)
assert.match(trackSql, /returning total_views, fansub_id into v_total_views, v_fansub_id;\s+v_counter_updated := found;/i,
  'the update result must be captured before PERFORM resets FOUND')
assert.match(trackSql, /revoke execute on function app_private\.track_manga_read\(uuid, uuid, numeric, text\) from public;/i)

// 6. Session guard: no postgres_changes subscription; periodic and focus/visibility sync remain.
const authContext = read('src/contexts/AuthContext.tsx')
assert.doesNotMatch(authContext, /['"`]postgres_changes['"`]/, 'AuthContext must not subscribe to postgres_changes')
assert.ok((authContext.match(/ACTIVE_SESSION_GUARD_INTERVAL_MS/g) ?? []).length >= 2,
  'the periodic session sync must stay as the revocation check')
assert.match(authContext, /'visibilitychange'/, 'the visibility-triggered session sync must stay')
const publicationSql = read(`${migrations}20261116100500_session_guard_without_postgres_changes.sql`)
assert.match(publicationSql, /alter publication supabase_realtime drop table public\.auth_session_events;/i)

console.log('PASS Supabase load-resilience contract kept')
