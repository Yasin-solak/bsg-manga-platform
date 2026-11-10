import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const migrationSource = readFileSync(
  path.join(rootDir, 'supabase/migrations/20260507235901_release_schedule_user_state.sql'),
  'utf8',
)

for (const tableName of ['release_schedule_reminders', 'user_reading_plan_items']) {
  assert.match(
    migrationSource,
    new RegExp(`alter table public\\.${tableName} enable row level security;`, 'i'),
    `${tableName} RLS is not on`,
  )
  assert.match(
    migrationSource,
    new RegExp(`revoke all on table public\\.${tableName} from anon;`, 'i'),
    `${tableName} anon yetkisi revoke edilmiyor`,
  )
  assert.match(
    migrationSource,
    new RegExp(`grant select, insert, update, delete on table public\\.${tableName} to authenticated;`, 'i'),
    `${tableName} authenticated tablo yetkisi eksik`,
  )
  assert.match(
    migrationSource,
    new RegExp(`on public\\.${tableName}[\\s\\S]*?for select[\\s\\S]*?to authenticated[\\s\\S]*?using \\(user_id = public\\.current_public_user_id\\(\\) or public\\.is_admin\\(\\)\\);`, 'i'),
    `${tableName} select policy self/admin guard icermiyor`,
  )
  assert.match(
    migrationSource,
    new RegExp(`on public\\.${tableName}[\\s\\S]*?for insert[\\s\\S]*?to authenticated[\\s\\S]*?with check \\(user_id = public\\.current_public_user_id\\(\\) or public\\.is_admin\\(\\)\\);`, 'i'),
    `${tableName} insert policy self/admin with check icermiyor`,
  )
  assert.match(
    migrationSource,
    new RegExp(`on public\\.${tableName}[\\s\\S]*?for update[\\s\\S]*?to authenticated[\\s\\S]*?using \\(user_id = public\\.current_public_user_id\\(\\) or public\\.is_admin\\(\\)\\)[\\s\\S]*?with check \\(user_id = public\\.current_public_user_id\\(\\) or public\\.is_admin\\(\\)\\);`, 'i'),
    `${tableName} update policy self/admin using+with check icermiyor`,
  )
  assert.match(
    migrationSource,
    new RegExp(`on public\\.${tableName}[\\s\\S]*?for delete[\\s\\S]*?to authenticated[\\s\\S]*?using \\(user_id = public\\.current_public_user_id\\(\\) or public\\.is_admin\\(\\)\\);`, 'i'),
    `${tableName} delete policy self/admin guard icermiyor`,
  )
}

assert.match(migrationSource, /check \(char_length\(reminder_text\) <= 240\)/)
assert.match(migrationSource, /unique \(user_id, target_kind, target_id\)/)
assert.match(migrationSource, /unique \(user_id, chapter_id\)/)

console.log('PASS release schedule RLS contract kept')
