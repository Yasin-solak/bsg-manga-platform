import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const migrationSource = readFileSync(
  path.join(rootDir, 'supabase', 'migrations', '20260331235906_fansub_boost_preview_refresh_hardening.sql'),
  'utf8',
)

assert.match(migrationSource, /create or replace function public\.list_public_fansub_boost_supporters_preview/i)
assert.match(migrationSource, /v_snapshot := public\.maybe_refresh_fansub_boost_snapshot\(p_fansub_id\);/i)
assert.doesNotMatch(migrationSource, /v_snapshot := public\.refresh_fansub_boost_snapshot\(p_fansub_id\);/i)
assert.match(migrationSource, /canUseSupporterList/i)
assert.match(migrationSource, /grant execute on function public\.list_public_fansub_boost_supporters_preview\(uuid, integer\) to anon, authenticated;/i)

console.log('PASS fansub boost supporter preview read-through hardening kept')
