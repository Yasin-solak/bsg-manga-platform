import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260526235903_store_purchase_sensitive_user_update_flag.sql',
  'utf8',
)

assert.match(
  migration,
  /v_store_purchase_update boolean := current_setting\('app\.store_purchase_user_update', true\) = 'true';/i,
  'Sensitive user guard store purchase transaction flagini okumali',
)

assert.match(
  migration,
  /v_request_path text := lower\(coalesce\(current_setting\('request\.path', true\), ''\)\);/i,
  'Sensitive user guard PostgREST request path bilgisini okumali',
)

assert.match(
  migration,
  /v_request_path ~ '\(\^\|\/\)rpc\/\(purchase_store_item\|purchase_user_badge\|purchase_fansub_badge\|redeem_coin_code/i,
  'the sensitive user guard must recognize critical RPCs with a request.path allowlist outside PG_CONTEXT',
)

assert.match(
  migration,
  /if v_store_purchase_update then[\s\S]*Magaza satin alma yalniz ekonomi ve aktif profil efekti alanlarini guncelleyebilir/i,
  'the store purchase flag must stay narrow to economy/profile effect fields only',
)

assert.match(
  migration,
  /to_jsonb\(new\) - 'stones' - 'owned_items' - 'premium_expires_at' - 'active_profile_effect_id' - 'updated_at'/i,
  'the store purchase guard must limit allowed columns with an explicit allowlist',
)

const purchaseFunctionStart = migration.indexOf('create or replace function public.purchase_store_item')
assert.notEqual(purchaseFunctionStart, -1, 'purchase_store_item must be redefined')
const purchaseFunction = migration.slice(purchaseFunctionStart)

const trustedUpdateBlocks = [
  ...purchaseFunction.matchAll(
    /perform set_config\('app\.store_purchase_user_update', 'true', true\);[\s\S]*?update public\.users[\s\S]*?perform set_config\('app\.store_purchase_user_update', '', true\);/gi,
  ),
]

assert.equal(
  trustedUpdateBlocks.length,
  2,
  'purchase_store_item must set a transaction flag before the users update for both normal and premium flows',
)

assert.match(
  purchaseFunction,
  /grant execute on function public\.purchase_store_item\(uuid\) to authenticated;/i,
  'purchase_store_item authenticated execute grantini korumali',
)

console.log('PASS Supabase store purchase sensitive update flag contract kept')
