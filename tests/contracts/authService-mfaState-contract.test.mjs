import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const mfaStateSource = readFileSync(
  path.join(rootDir, 'src', 'services', 'authService', 'mfaState.ts'),
  'utf8',
)

assert.match(
  mfaStateSource,
  /import \{ withServiceTimeout \} from '\.\.\/apiResilience'/,
  'MFA state reading must use the shared service timeout limit',
)
assert.match(
  mfaStateSource,
  /withServiceTimeout\([\s\S]*supabase\.auth\.mfa\.listFactors\(\)[\s\S]*supabase\.auth\.mfa\.getAuthenticatorAssuranceLevel\(\)[\s\S]*label: 'MFA durumunu yukleme'/,
  'MFA factors and assurance level must be read under one timeout guard',
)
assert.match(
  mfaStateSource,
  /try \{[\s\S]*return await request[\s\S]*finally \{[\s\S]*mfaStateSummaryInFlight = null/,
  'a pending MFA request must be cleared after a timeout or service error',
)
assert.match(
  mfaStateSource,
  /if \(!forceRefresh && mfaStateSummaryCache && mfaStateSummaryCache\.expiresAt > now\)/,
  'MFA cache davranisi timeout korumasi eklenirken korunmali',
)

console.log('PASS MFA state service timeout and cache contract kept')
