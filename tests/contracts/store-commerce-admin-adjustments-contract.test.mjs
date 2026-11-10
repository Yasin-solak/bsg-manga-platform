import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const migration = read('supabase/migrations/20260611235904_store_commerce_admin_adjustments.sql')
// The old shop admin panel and service are gone (Shop v3: shop_admin_refund_order, shop-v3-contract); the DB guarantee is kept.

assert.match(migration, /create or replace function app_private\.admin_apply_store_commerce_operation_impl/i)
assert.match(migration, /security definer/i)
assert.match(migration, /public\.is_admin\(\)/i)
assert.match(migration, /create or replace function public\.admin_apply_store_commerce_operation/i)
assert.match(migration, /security invoker/i)
assert.match(migration, /grant execute on function public\.admin_apply_store_commerce_operation\(uuid, text, text, uuid\) to authenticated, service_role/i)
assert.match(migration, /revoke execute on function public\.admin_apply_store_commerce_operation\(uuid, text, text, uuid\) from public, anon/i)

assert.match(migration, /v_operation not in \('refund', 'revoke'\)/i)
assert.match(migration, /char_length\(v_reason\) < 10/i)
assert.match(migration, /v_request_key is null/i)
assert.match(migration, /v_order\.order_kind = 'premium_purchase'/i)
assert.match(migration, /Sadece tamamlanmis order/i)

assert.match(migration, /set stones = coalesce\(u\.stones, 0\) \+ v_refund_amount/i)
assert.match(migration, /insert into public\.store_wallet_ledger/i)
assert.match(migration, /'admin_adjustment'/i)
assert.match(migration, /'refund'/i)
assert.match(migration, /balance_after/i)

assert.match(migration, /store_revoke_user_order_entitlements/i)
assert.match(migration, /update public\.user_inventory_items/i)
assert.match(migration, /is_active = false/i)
assert.match(migration, /owned_items = v_owned/i)
assert.match(migration, /frame_type = case/i)
assert.match(migration, /background_type = case/i)
assert.match(migration, /active_profile_effect_id = case/i)

assert.match(migration, /store_revoke_fansub_order_entitlements/i)
assert.match(migration, /delete from public\.fansub_inventory/i)
assert.match(migration, /active_frame_id = case/i)
assert.match(migration, /active_background_id = case/i)
assert.match(migration, /active_pattern_id = case/i)

assert.match(migration, /perform public\.create_admin_audit_log/i)
assert.match(migration, /store_order\.refund/i)
assert.match(migration, /store_order\.revoke/i)
assert.match(migration, /lastAdminOperation/i)
assert.match(migration, /idempotentReplay/i)

console.log('PASS store commerce admin adjustments contract kept')
