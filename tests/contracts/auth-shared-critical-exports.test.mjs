import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const authSharedSource = readFileSync(path.join(rootDir, 'src', 'services', 'authService', 'shared.ts'), 'utf8')
const userFacingErrorSource = readFileSync(path.join(rootDir, 'src', 'services', 'userFacingError.ts'), 'utf8')

const authExports = [
  'normalizeUsernameInput',
  'validateUsernameInput',
  'settleAuthenticatedSession',
  'ensureAuthenticatedClientState',
  'getMfaStateSummary',
  'getPendingMfaChallenge',
  'buildMfaRequiredError',
  'isMfaRequiredError',
  'readSessionIdFromAccessToken',
  'syncSessionContext',
  'activateSingleSession',
  'ensureExpectedSession',
  'isSessionReplacedError',
  'ensureUserProfile',
  'toFriendlyAuthError',
]

for (const exportName of authExports) {
  assert.match(
    authSharedSource,
    new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${exportName}\\b`),
    `${exportName} exportu korunmali`,
  )
}

assert.match(authSharedSource, /normalize\('NFKD'\)/, 'normalizeUsernameInput unicode normalize mantigini korumali')
assert.match(authSharedSource, /isReservedUsernameValue/, 'validateUsernameInput reserved username kontrolunu korumali')
assert.match(authSharedSource, /UUID_PATTERN\.test\(sessionId\)/, 'readSessionIdFromAccessToken must keep UUID validation')
assert.match(authSharedSource, /MFA_REQUIRED_ERROR/, 'MFA helpers must keep the shared error code')
assert.match(authSharedSource, /SESSION_REPLACED_ERROR/, 'the single-session replaced guard must be kept')

const userFacingErrorExports = [
  'toUserFacingErrorMessage',
  'buildUserFacingErrorPayload',
  'reportUserFacingError',
]

for (const exportName of userFacingErrorExports) {
  assert.match(
    userFacingErrorSource,
    new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${exportName}\\b`),
    `${exportName} exportu korunmali`,
  )
}

assert.match(userFacingErrorSource, /fallback/, 'user facing error helperlari fallback mesaji uretmeli')

console.log('PASS auth shared and user-facing error critical export contract kept')
