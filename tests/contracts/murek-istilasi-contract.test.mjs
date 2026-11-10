import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Mürek Invasion: an event catching a cousin that appears on the site. Spawn decisions and catch validation
// are on the server; written uniquely to the coin ledger by ticket id; a daily limit and cooldown
// limit abuse; private accounts are anonymous in the ranking, the reader is not interrupted.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261008160000_murek_istilasi_event.sql')

assert.match(sql, /revoke all on table public\.istila_spawns from public, anon, authenticated;/, 'the ticket table is closed to clients')
assert.match(sql, /'dailyLimit', 10,/, 'gunluk 10 yakalama')
assert.match(sql, /'cooldownSeconds', 75,/, 'cooldown between two spawns')
assert.match(sql, /s\.id = p_spawn_id and s\.user_id = v_user_id for update/, 'only your own ticket')
assert.match(sql, /raise exception 'ISTILA_ALREADY_CAUGHT'/, 'the same cousin cannot be caught twice')
assert.match(sql, /raise exception 'ISTILA_ESCAPED'/, 'an expired cousin escapes')
assert.match(sql, /raise exception 'ISTILA_DAILY_LIMIT'/, 'gunluk sinir yakalamada da')
assert.match(sql, /'istila_catch', v_spawn\.id::text, 'credit', 'Coin', v_spawn\.reward/, 'unique credit by ticket id in the ledger')
assert.match(sql, /pg_advisory_xact_lock\(pg_catalog\.hashtext\('istila:' \|\| v_user_id::text\)\)/, 'per-user order (no race)')
assert.match(sql, /when u\.profile_visibility = 'private' then 'Gizli avcı'/, 'a private account is nameless in the leaderboard')
assert.match(sql, /coalesce\(u\.is_banned, false\) = false/, 'banned users are not in the leaderboard')
assert.match(sql, /grant execute on function public\.istila_catch\(uuid\) to authenticated;/)
assert.doesNotMatch(sql, /grant execute on function public\.istila_catch\(uuid\) to anon/, 'a guest cannot catch')
assert.doesNotMatch(sql, /grant execute on function public\.istila_request_spawn\(text\) to anon/, 'no spawn for guests')
assert.match(sql, /cardinality\(v_kinds\) = 5/, 'five cousins -> badge')

const spawner = read('src/components/murek/IstilaSpawner.tsx')
assert.match(spawner, /requestIstilaSpawn\(surface\)/, 'a spawn is requested from the server')
assert.match(spawner, /updateCurrentUser\(\{ stones: result\.balance \}\)/, 'balance updates with the server response')
assert.match(spawner, /document\.visibilityState !== 'visible'/, 'no request on a hidden tab')
const layout = read('src/components/layout/Layout.tsx')
const chromeStart = layout.indexOf('if (!shouldUseChrome) {')
assert.ok(chromeStart > 0 && layout.indexOf('<IstilaSpawner />') > chromeStart + 200, 'cousins only on shell pages (the reader is not interrupted)')
assert.match(read('src/pages/shop/ShopSeasonView.tsx'), /season\.slug === ISTILA_SEASON_SLUG && <IstilaPanel \/>/, 'event panel on the season page')

console.log('PASS Murek Invasion: server-validated catch, daily limit, unique ledger, hidden leaderboard, reader not interrupted')
