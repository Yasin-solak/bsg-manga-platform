import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const migrationSource = readFileSync(
  path.join(rootDir, 'supabase', 'migrations', '20260331235907_fansub_boost_purchase_hardening.sql'),
  'utf8',
)

assert.match(migrationSource, /coalesce\(v_user\.is_banned, false\) = true/i)
assert.match(migrationSource, /v_duplicate_window interval := interval '12 seconds'/i)
assert.match(migrationSource, /from public\.fansub_boost_grants g/i)
assert.match(migrationSource, /g\.created_at >= now\(\) - v_duplicate_window/i)
assert.match(migrationSource, /coalesce\(g\.supporter_note, ''\) = coalesce\(v_supporter_note, ''\)/i)
assert.match(migrationSource, /v_supporter_note ~\* '\(https\?:\/\/\|www\\\.\)'/i)
assert.match(migrationSource, /returning stones into v_new_user_stones/i)

console.log('PASS fansub boost purchase hardening contract kept')
