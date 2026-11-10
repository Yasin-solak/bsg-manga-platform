import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const readModel = readSource('supabase/migrations/20260722082346_admin_user_detail_insights_read_model.sql')
const indexes = readSource('supabase/migrations/20260722082349_admin_user_detail_insights_indexes.sql')

assert.match(readModel, /create or replace function app_private\.get_admin_user_detail_insights\(/i)
assert.match(readModel, /security definer\s+set search_path = ''/i)
assert.match(readModel, /coalesce\(auth\.role\(\), ''\) <> 'service_role'[\s\S]{0,120}?app_private\.is_admin\(\)/i)
assert.match(readModel, /create or replace function public\.get_admin_user_detail_insights\(/i)
assert.match(readModel, /language sql\s+stable\s+security invoker\s+set search_path = ''/i)
assert.match(readModel, /revoke all on function public\.get_admin_user_detail_insights\(uuid, integer, integer\)[\s\S]{0,100}?from public, anon, authenticated/i)
assert.match(readModel, /grant execute on function public\.get_admin_user_detail_insights\(uuid, integer, integer\)[\s\S]{0,80}?to authenticated, service_role/i)

for (const source of ['public.activity_events', 'public.security_events', 'public.audit_logs', 'public.reports']) {
  assert.match(readModel, new RegExp(source.replace('.', '\\.')), `${source} read modelde kullanilmali`)
}
for (const field of ['timeBuckets', 'securityEventCount', 'adminActionCount', 'currentBan', 'actorUsername', 'outcome']) {
  assert.match(readModel, new RegExp(`'${field}'`), `${field} payload field must be kept`)
}

assert.doesNotMatch(readModel, /description/i, 'the report description must not move to the purpose-built admin payload')
assert.doesNotMatch(`${readModel}\n${indexes}`, /create\s+index\s+concurrently/i)
assert.match(indexes, /audit_logs \(resource_id, created_at desc\)[\s\S]{0,100}?resource_type = 'user'/i)
assert.match(indexes, /reports \(target_id, created_at desc\)[\s\S]{0,80}?target_type = 'user'/i)

console.log('PASS admin user detail activity and moderation read-model contract kept')
