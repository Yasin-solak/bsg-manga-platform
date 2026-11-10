import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260527235905_storage_session_helper_execute_grants.sql',
  'utf8',
)

assert.match(
  migration,
  /grant execute on function public\.current_auth_session_id\(\) to anon, authenticated, service_role;/i,
  'current_auth_session_id must get an execute grant for the Storage policy context',
)

assert.match(
  migration,
  /grant execute on function public\.is_auth_session_revoked\(uuid, uuid\) to anon, authenticated, service_role;/i,
  'is_auth_session_revoked must get an execute grant for the Storage policy context',
)

assert.match(migration, /notify pgrst, 'reload schema';/i)

console.log('PASS Supabase storage session helper execute grant contract kept')
