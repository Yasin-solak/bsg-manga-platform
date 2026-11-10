import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const migration = [
  read('supabase/migrations/20260611235901_store_commerce_ledger_foundation.sql'),
  read('supabase/migrations/20260611235902_store_commerce_admin_ops.sql'),
].join('\n')
// The old client purchase key (sessionStorage) went with mutations.ts; v3 has one request key per window (shop-v3-contract).
// The old sales analysis panel, summary service and analytics service are gone (Shop v3: shop_admin_economy); the ledger and idempotent purchase guarantee are kept.

assert.match(migration, /create table if not exists public\.store_orders/i)
assert.match(migration, /create table if not exists public\.store_order_items/i)
assert.match(migration, /create table if not exists public\.user_inventory_items/i)
assert.match(migration, /create table if not exists public\.store_wallet_ledger/i)
assert.match(migration, /create table if not exists public\.store_item_analytics_events/i)

assert.match(migration, /alter table public\.store_orders enable row level security/i)
assert.match(migration, /store_orders_select_owner_or_admin/i)
assert.match(migration, /store_order_items_select_visible_order/i)
assert.match(migration, /user_inventory_items_select_owner_or_admin/i)
assert.match(migration, /store_wallet_ledger_select_owner_or_admin/i)
assert.match(migration, /store_item_analytics_events_insert_authenticated/i)

assert.match(migration, /trg_store_purchase_requests_record_order/i)
assert.match(migration, /trg_store_item_gifts_record_order/i)
assert.match(migration, /trg_store_package_events_record_order/i)
assert.match(migration, /store_record_item_purchase_order_from_request/i)
assert.match(migration, /store_record_item_gift_order/i)
assert.match(migration, /store_record_package_order/i)

assert.match(migration, /insert into public\.store_orders[\s\S]*from public\.store_purchase_requests/i)
assert.match(migration, /insert into public\.store_orders[\s\S]*from public\.store_item_gifts/i)
assert.match(migration, /insert into public\.store_orders[\s\S]*from public\.store_package_events/i)
assert.match(migration, /insert into public\.store_wallet_ledger/i)
assert.match(migration, /insert into public\.user_inventory_items/i)

assert.match(migration, /create or replace function public\.get_admin_store_sales_summary\(\)/i)
assert.match(migration, /coinRevenue/i)
assert.match(migration, /typeDistribution/i)
assert.match(migration, /topItems/i)
assert.match(migration, /grant execute on function public\.get_admin_store_sales_summary\(\) to authenticated, service_role/i)

assert.match(migration, /validate_store_studio_snapshot_references/i)
assert.match(migration, /trg_storefront_homepage_snapshots_studio_guard/i)
assert.match(migration, /pasif urun veya paket referansi/i)

assert.match(migration, /create or replace function public\.track_store_item_analytics_event/i)
assert.match(migration, /grant execute on function public\.track_store_item_analytics_event\(text, text, text, text, text, jsonb\) to authenticated, service_role/i)

console.log('PASS store commerce ledger foundation contract kept')
