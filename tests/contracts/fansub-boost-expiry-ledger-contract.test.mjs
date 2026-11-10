import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Fansub boost: expiry is automatic (scheduled job), notification once per boost,
// spending in the wallet ledger. The level used to refresh only on page open, and the catalog /
// special notification / fansub tag could use an ended boost's perk.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const sql = read('supabase/migrations/20261009180000_fansub_boost_expiry_ledger.sql')

assert.match(sql, /cron\.schedule\('fansub-boost-expiry', '\*\/10 \* \* \* \*', 'select app_private\.fansub_boost_expiry_tick\(\);'\)/, 'expiry every 10 minutes')
assert.match(sql, /cron\.unschedule\(jobid\) from cron\.job where jobname = 'fansub-boost-expiry'/, 'a job recreated does not run twice')
assert.match(sql, /v_snapshot := public\.refresh_fansub_boost_snapshot\(v_fansub\.fansub_id\);/, 'level is recalculated on expiry')
assert.match(sql, /not \(coalesce\(g\.metadata, '\{\}'::jsonb\) \? 'expiryNotifiedAt'\)/, 'expiry notification once per boost')
assert.match(sql, /not \(coalesce\(g\.metadata, '\{\}'::jsonb\) \? 'expiryWarnedAt'\)/, 'reminder once per boost')
assert.match(sql, /g\.expires_at <= now\(\) \+ interval '3 days'/, 'bitise 3 gun kala hatirlatma')
assert.match(sql, /where expires_at <= now\(\);\n/, 'no bulk notification rain for those expired in the past')
assert.match(sql, /'fansub_boost', v_grant\.id::text, 'debit', 'Coin', -v_total_coin_cost, v_new_user_stones/, 'harcama defterde debit')
assert.match(sql, /on conflict \(source_kind, source_ref, entry_type\) do nothing/, 'retroactive ledger is unique')
assert.match(sql, /revoke all on function app_private\.fansub_boost_expiry_tick\(\) from public, anon, authenticated;/, 'the client cannot trigger the job')
assert.match(sql, /raise exception 'Takviye adedi 1 ile 10 arasinda olmalidir\.'/, 'adet siniri korunur')
assert.match(sql, /raise exception 'Yeterli coin bulunamadi\.'/, 'bakiye kontrolu korunur')

console.log('PASS fansub boost: automatic expiry, one-time notification, wallet ledger')
