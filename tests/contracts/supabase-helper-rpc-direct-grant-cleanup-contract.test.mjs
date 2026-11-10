import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const migration = read('supabase/migrations/20260520235902_helper_rpc_direct_grant_cleanup.sql')

for (const signature of [
  'public.chapter_public_unlock_at(timestamp with time zone)',
  'public.is_chapter_publicly_unlocked(timestamp with time zone)',
  'public.is_feature_enabled(text, boolean)',
]) {
  assert.ok(migration.includes(`'${signature}'`), `${signature} must be in the direct RPC grant cleanup scope`)
}

assert.match(migration, /revoke execute on function %s from anon, authenticated, public/)
assert.match(migration, /grant execute on function %s to service_role/)
assert.match(migration, /notify pgrst, 'reload schema';/)

console.log('PASS helper RPC direct grant cleanup contract kept')
