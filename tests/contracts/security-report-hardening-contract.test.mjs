import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const hardeningMigration = read('supabase/migrations/20260615235902_security_report_hardening.sql')
const shopService = read('src/services/shopService.ts')
const shopCoreMigration = read('supabase/migrations/20260930170000_shop_v3_core.sql')
const liveProductionE2e = read('tests/e2e/live-production-tester.spec.ts')
const backendE2e = read('tests/e2e/comprehensive-backend-test.spec.ts')
const commentsE2e = read('tests/e2e/comments-verification-test.spec.ts')
const e2eSources = [liveProductionE2e, backendE2e, commentsE2e].join('\n')

const forbiddenE2eLiteralPatterns = [
  ['tester', '@gmail\\.com'].join(''),
  ['TEST-', 'MPD4AILW00'].join(''),
  ['DENE-', 'MPN0RN3C00'].join(''),
].map((pattern) => new RegExp(pattern))

for (const pattern of forbiddenE2eLiteralPatterns) {
  assert.doesNotMatch(
    e2eSources,
    pattern,
    'live E2E tests must not carry temporary accounts and codes in source; env is required.',
  )
}
// Test and audit scripts do not carry the password in source; the value comes only from the environment.
const credentialSources = [e2eSources, read('scripts/audit-idor-mutations.mjs'), read('scripts/audit-privilege-escalation.mjs')].join(' ')
assert.doesNotMatch(credentialSources, /password\s*[:=]\s*['"`][^'"`]+['"`]/i, 'passwords are not hard-coded in source')
assert.match(liveProductionE2e, /LIVE_E2E_EMAIL/)
assert.match(liveProductionE2e, /LIVE_E2E_PASSWORD/)
assert.match(liveProductionE2e, /LIVE_E2E_COIN_CODE/)
assert.match(liveProductionE2e, /test\.skip\(missingLiveE2eEnv\.length > 0/)
assert.match(backendE2e, /LIVE_E2E_PROMO_CODE/)
assert.match(backendE2e, /test\.skip\(missingBackendE2eEnv\.length > 0/)
assert.match(commentsE2e, /test\.skip\(missingCommentsE2eEnv\.length > 0/)

// The old showcase studio carried free external links (https) and needed cleaning.
// Shop v3 campaigns only carry internal product / season references; there is no free href field.
assert.doesNotMatch(shopService, /href/i)
assert.doesNotMatch(shopCoreMigration, /'href'|cta_url|external_url/i)

assert.match(hardeningMigration, /fm\.role = 'admin'/)
assert.doesNotMatch(
  hardeningMigration,
  /fm\.role\s+in\s+\('admin',\s*'moderator'\)/i,
  'the legacy Supabase Storage helper must not widen moderator write permission again.',
)
assert.match(
  hardeningMigration,
  /revoke execute on function app_private\.store_revoke_user_order_entitlements\(uuid\) from public, anon, authenticated;/i,
)
assert.match(
  hardeningMigration,
  /grant execute on function app_private\.store_revoke_user_order_entitlements\(uuid\) to service_role;/i,
)
assert.match(
  hardeningMigration,
  /revoke execute on function app_private\.store_revoke_fansub_order_entitlements\(uuid\) from public, anon, authenticated;/i,
)
assert.match(
  hardeningMigration,
  /grant execute on function app_private\.store_revoke_fansub_order_entitlements\(uuid\) to service_role;/i,
)

console.log('PASS security report hardening contract kept')
