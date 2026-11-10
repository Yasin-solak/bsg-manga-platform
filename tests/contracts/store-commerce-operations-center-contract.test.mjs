import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const migration = read('supabase/migrations/20260611235903_store_commerce_operations_center.sql')
// The old operations center panel and service are gone (Shop v3: shop_admin_orders); the DB guarantee is kept.

assert.match(migration, /create or replace function app_private\.get_admin_store_commerce_operations/i)
assert.match(migration, /security definer/i)
assert.match(migration, /public\.is_admin\(\)/i)
assert.match(migration, /create or replace function public\.get_admin_store_commerce_operations/i)
assert.match(migration, /security invoker/i)
assert.match(migration, /grant execute on function public\.get_admin_store_commerce_operations\(text, text, text, boolean, integer\) to authenticated, service_role/i)
assert.match(migration, /revoke execute on function public\.get_admin_store_commerce_operations\(text, text, text, boolean, integer\) from public, anon/i)

for (const signal of [
  'self_gift',
  'high_value',
  'rapid_actor',
  'missing_wallet',
  'wallet_mismatch',
  'missing_items',
  'missing_inventory',
]) {
  assert.match(migration, new RegExp(signal), `${signal} risk sinyali migrasyonda korunmali`)
}

assert.match(migration, /public\.store_orders/i)
assert.match(migration, /public\.store_order_items/i)
assert.match(migration, /public\.store_wallet_ledger/i)
assert.match(migration, /public\.user_inventory_items/i)
assert.match(migration, /public\.public_user_directory/i)

console.log('PASS store commerce operations center contract kept')
