import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const authSource = readFileSync(path.join(rootDir, 'src', 'services', 'authService', 'shared.ts'), 'utf8')
const authSessionSource = readFileSync(path.join(rootDir, 'src', 'services', 'authService', 'session.ts'), 'utf8')
const authContextSource = readFileSync(path.join(rootDir, 'src', 'contexts', 'AuthContext.tsx'), 'utf8')
const loggerSource = readFileSync(path.join(rootDir, 'src', 'services', 'logger.ts'), 'utf8')

assert.match(authSource, /releaseExpiredOwnBanIfNeeded/)
assert.match(authSource, /ensureExpectedSession/)
assert.match(authSource, /createScopedLogger/)
assert.match(authSource, /authLogger\.(warn|error)/)
assert.match(authSessionSource, /async function clearLocalSession\(/)
assert.match(authSessionSource, /if \(isSessionReplacedError\(error\)\) \{[\s\S]*?await clearLocalSession\(\)[\s\S]*?throw error[\s\S]*?\}/)
assert.match(authContextSource, /const scheduleSyncCurrentUser = \(\) => \{[\s\S]*?window\.setTimeout\(\(\) => \{[\s\S]*?syncCurrentUserRef\.current\(\{ force: true \}\)/)
assert.match(authContextSource, /supabase\.auth\.onAuthStateChange\(\(event\) => \{[\s\S]*?scheduleSyncCurrentUser\(\)/)
assert.match(loggerSource, /createScopedLogger/)

console.log('PASS auth session guard contract kept')
