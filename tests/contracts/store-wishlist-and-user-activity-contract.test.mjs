import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const migrationSource = readSource('supabase/migrations/20260609235901_store_wishlist_and_activity_visibility.sql')
const hotfixMigrationSource = readSource('supabase/migrations/20260609235902_store_user_activity_rls_hotfix.sql')
const activityRpcMigrationSource = readSource('supabase/migrations/20260610191448_store_activity_rpc_and_wishlist_actions.sql')
// The old shop wishlist / activity UI and service are gone (Shop v3: shop_wishlist, RPC only); RLS and access guarantees of old tables are kept.

assert.match(migrationSource, /create table if not exists public\.store_wishlist_items/, 'the wishlist must be stored in a durable table.')
assert.match(migrationSource, /alter table public\.store_wishlist_items enable row level security/, 'RLS must be on for the wishlist.')
assert.match(migrationSource, /user_id = \(select app_private\.current_public_user_id\(\)\)/, 'the wishlist policy must resolve the user with a safe private helper.')
assert.doesNotMatch(migrationSource, /public\.current_public_user_id\(\)/, 'new shop policies must not call a direct public helper.')
assert.match(migrationSource, /store_item_gifts_select_participant[\s\S]*sender_user_id[\s\S]*recipient_user_id/, 'product gifts must be open only to the sender or recipient.')
assert.match(migrationSource, /store_package_events_select_participant[\s\S]*actor_user_id[\s\S]*recipient_user_id/, 'bundle operations must be open only to the actor or recipient.')
assert.doesNotMatch(migrationSource, /grant select.*store_wishlist_items to anon/i, 'the wishlist must not be open to anonymous users.')

assert.match(hotfixMigrationSource, /store_purchase_requests_owner_read[\s\S]*app_private\.current_public_user_id\(\)/, 'the hotfix must renew the purchase policy with a private helper.')
assert.match(hotfixMigrationSource, /store_item_gifts_select_participant[\s\S]*app_private\.current_public_user_id\(\)/, 'the hotfix must renew the product gift participant policy.')
assert.match(hotfixMigrationSource, /store_package_events_select_participant[\s\S]*app_private\.current_public_user_id\(\)/, 'the hotfix must renew the bundle event participant policy.')
assert.doesNotMatch(hotfixMigrationSource, /public\.current_public_user_id\(\)/, 'Hotfix direct public helper cagirmamalidir.')
assert.match(hotfixMigrationSource, /revoke select on table public\.store_wishlist_items from anon/, 'the hotfix must keep anonymous wishlist reads closed.')

assert.match(activityRpcMigrationSource, /create or replace function app_private\.get_my_store_activity\(/, 'shop activity ledger reads must stay inside a private helper.')
assert.match(activityRpcMigrationSource, /create or replace function public\.get_my_store_activity\(/, 'an authenticated activity RPC wrapper must exist for the client.')
assert.match(activityRpcMigrationSource, /security invoker/, 'the public activity RPC wrapper must be security invoker.')
assert.match(activityRpcMigrationSource, /store_item_gifts[\s\S]*sender_user_id = v_user_id[\s\S]*recipient_user_id = v_user_id/, 'the activity RPC must cover sender and recipient users on product gifts.')
assert.match(activityRpcMigrationSource, /store_package_events[\s\S]*actor_user_id = v_user_id[\s\S]*recipient_user_id = v_user_id/, 'the activity RPC must cover sender and recipient users on bundle gifts.')
assert.match(activityRpcMigrationSource, /revoke select on table public\.store_item_gifts from anon, authenticated/, 'the gift ledger table must not stay open to Data API reads outside the RPC.')
assert.match(activityRpcMigrationSource, /grant execute on function public\.get_my_store_activity\(integer\)[\s\S]*authenticated/, 'the activity RPC must be open to the authenticated role.')

console.log('PASS shop wishlist and user activity contract kept')
