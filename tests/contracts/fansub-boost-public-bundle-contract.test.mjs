import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const migrationSource = readFileSync(
  path.join(rootDir, 'supabase', 'migrations', '20260331235908_fansub_boost_public_bundle.sql'),
  'utf8',
)
const serviceSource = readFileSync(path.join(rootDir, 'src', 'services', 'fansubBoostService.ts'), 'utf8')

assert.match(migrationSource, /create or replace function public\.get_public_fansub_boost_bundle/i)
assert.match(migrationSource, /from public\.get_public_fansub_boost_snapshot\(p_fansub_id\)/i)
assert.match(migrationSource, /active_supporters as \(/i)
assert.doesNotMatch(migrationSource, /from public\.list_public_fansub_boost_supporters_preview\(p_fansub_id, v_limit\)/i)
assert.match(migrationSource, /grant execute on function public\.get_public_fansub_boost_bundle\(uuid, integer\) to anon, authenticated;/i)
assert.match(serviceSource, /getPublicFansubBoostBundle/)
assert.match(serviceSource, /supabase\.rpc\('get_public_fansub_boost_bundle'/)

console.log('PASS fansub boost public bundle contract kept')
