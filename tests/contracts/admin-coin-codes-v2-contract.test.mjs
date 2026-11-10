import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { untranslate } from './i18n-source.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relativePath) => untranslate(readFileSync(path.join(root, relativePath), 'utf8'))
const migration = read('supabase/migrations/20260727145919_admin_coin_codes_v2.sql')
const service = read('src/services/redeemCodeService/adminV2.ts')
const section = read('src/components/admin/CoinCodeManagementSection.tsx')
const pane = read('src/components/admin/coinCodes/CoinCodeDetailPane.tsx')
const generate = read('src/components/admin/coinCodes/CoinCodeGenerateDialog.tsx')
const templateSchema = read('src/components/admin/coinCodes/coinCodeTemplateSchema.ts')
const utils = read('src/components/admin/coinCodes/coinCodeManagementUtils.ts')
const page = read('src/pages/AdminPage.tsx')

assert.ok(migration.split(/\r?\n/).length < 750, 'the Coin code migration file must stay under 750 lines')
assert.doesNotMatch(migration, /create index concurrently/i, 'Transaction icinde CONCURRENTLY kullanilmamali')
assert.match(migration, /^begin;/m)
assert.match(migration, /^commit;/m)

for (const rpcName of [
  'get_admin_coin_code_overview',
  'list_admin_coin_codes_page',
  'list_admin_coin_code_activations_page',
  'create_admin_coin_code_batch',
  'bulk_set_admin_coin_codes_active',
]) {
  assert.match(migration, new RegExp(`function public\\.${rpcName}\\(`, 'i'), `${rpcName} must be a public RPC`)
  assert.match(service, new RegExp(`supabase\\.rpc\\('${rpcName}'`), `${rpcName} must be used on the client side`)
}

assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i)
assert.match(migration, /app_private\.is_admin\(\)/i)
assert.match(migration, /errcode = '42501'/i)
assert.match(migration, /errcode = '22023'/i)
assert.match(migration, /set search_path = ''/i)
assert.doesNotMatch(
  migration,
  /function public\.(?:create_admin_coin_code_batch|bulk_set_admin_coin_codes_active)\([\s\S]{0,500}?security definer/i,
  'exposed public mutation RPCs must not be security definer',
)
assert.match(migration, /function app_private\.create_admin_coin_code_batch\(/i)
assert.match(migration, /function app_private\.bulk_set_admin_coin_codes_active\(/i)
assert.match(migration, /revoke all on function public\.get_admin_coin_code_overview\(integer\) from public, anon;/i)
assert.match(migration, /grant execute on function public\.get_admin_coin_code_overview\(integer\) to authenticated, service_role;/i)
assert.match(migration, /create_admin_audit_log/i, 'generation and bulk mutation must leave an audit record')
assert.match(
  migration,
  /revoke insert, update, delete on table public\.redeem_codes from anon, authenticated;/i,
  'Dogrudan tablo yazimi audit bariyerini baypas etmemeli',
)
assert.match(migration, /\(created_at desc, id desc\)/i, 'a code keyset pagination index must exist')
assert.match(migration, /\(redeemed_at desc, id desc\)/i, 'an activation keyset pagination index must exist')

assert.match(service, /\.strict\(\)/, 'RPC payloads must be validated with strict Zod schemas')
assert.doesNotMatch(service, /\.from\('redeem_codes'\)/, 'V2 admin servisi redeem_codes tablosunu dogrudan taramamali')
assert.doesNotMatch(service, /service_role/i, 'the client must not trust the service role key')

// Coin codes v2 desk (2026-11-03): summary strip = status view (from the server
// summary), cursor-paged code list + selected code panel; Redemptions in a separate
// tab; generation in a dialog.
for (const [id, label] of [
  ['all', 'T\u00fcm kodlar'],
  ['active', 'Kullan\u0131labilir'],
  ['used', 'Kullan\u0131lm\u0131\u015f'],
  ['expired', 'S\u00fcresi dolan'],
  ['passive', 'Pasif'],
]) {
  assert.match(section, new RegExp(`id: '${id}', label: '${label}'`), `${label} view must be kept`)
}
assert.match(section, /const value = overview \? view\.count\(overview\) : null/)
assert.match(section, /overview\.activeExposureCoin/)
assert.match(page, /'coin_codes', 'support'/, 'Coin codes pin to the screen in the desk layout')
assert.match(section, /useDeskLayout\(\)/)
assert.match(section, /xl:grid-rows-\[minmax\(0,1fr\)\]/)
assert.match(section, /min-h-0 divide-y divide-border\/50 overflow-y-auto/)
assert.match(section, /onOpenAutoFocus=\{focusSheetContainer\}/)
assert.match(section, /export const COIN_CODES_PER_PAGE = 20\b/)
assert.doesNotMatch(section, /<table/, 'Genis tablo yerine liste + ayrinti')

// CSV downloads all records matching the filter (the old version only the visible page).
assert.match(section, /while \(cursor && rows\.length < EXPORT_MAX\)/)

// Deactivating / activating asks for a reason and states the result.
assert.match(section, /<AdminReasonDialog/)
assert.match(section, /minLength=\{5\}/)
assert.match(section, /daha önce yüklenen coinler geri alınmaz/)

// Code status by usability (a multi-use code is not "used" after one redemption).
assert.match(utils, /if \(item\.usedCount >= item\.maxUses\) return \{ id: 'exhausted' as const, label: 'T\u00fckendi' \}/)
assert.doesNotMatch(utils, /if \(item\.usedCount > 0\) return/)

// Panel: this code's users.
assert.match(pane, /listAdminCoinActivationsPage\(\{ search: code\.code, limit: 20 \}\)/)
assert.match(pane, /data-testid="coin-code-usages"/)

// Generation: a sample in the real format, maximum distribution, explicit confirm on high risk, templates.
assert.match(utils, /export function sampleCoinCode/)
assert.match(generate, /sampleCoinCode\(form\.prefix/)
assert.match(generate, /needsAccept && !riskAccepted/)
assert.match(generate, /coinCodeTemplateStorageSchema/)
assert.match(generate, /window\.localStorage\.setItem\(STORAGE_KEY/, 'admin private templates persist in the browser')
assert.match(templateSchema, /z\.object/)
assert.match(generate, /data-testid="coin-code-created-list"/, 'Uretilen kodlar pencerede gosterilir (kopyala / CSV)')

console.log('PASS admin-coin-codes-v2-contract.test.mjs')
