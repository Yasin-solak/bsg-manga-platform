/**
 * Social sign-in providers contract (src/services/oauthProviders.ts).
 *
 * Protected decisions:
 *
 * 1. THE BUTTON DEPENDS ON A FLAG, DEFAULT OFF. Provider setup (enabling the provider in Supabase +
 * defining an app at Google/Discord) IS NOT CODE WORK. Showing a button before setup
 * means a button where a tap does nothing; the user blames themselves.
 * 2. IF UNKNOWN IT IS NOT SHOWN. A check like `!== false` would SHOW the button when the flag
 * cannot be read.
 * 3. NO APPLE, by product decision: Discord instead.
 * 4. The network call has a TIMEOUT wrapper: if the redirect cannot start the user
 * should not stare at a button "waiting" forever.
 * 5. Flag keys must be in the REGISTRY; an unregistered key escapes repo-health's feature flag audit.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const providers = stripComments(read('src/services/oauthProviders.ts'))
const registry = read('src/services/featureFlagRegistry.ts')

// 1-2. Suzgec: yalnizca ACIK bayraklar gecer.
assert.match(
  providers,
  /flags\[provider\.flagKey\] === true/,
  'only providers with their flag ON must pass',
)
assert.ok(
  !/flags\[provider\.flagKey\] !== false/.test(providers),
  'an unknown flag must not count as ON',
)
assert.match(
  providers,
  /getRuntimeFeatureFlags\(\s*[\s\S]*?,\s*false,?\s*\)/,
  'the flag default must be false: no record means the provider is not set up',
)

// 3. No Apple, Discord yes.
assert.ok(!/['"]apple['"]/.test(providers), 'Apple must not be added (product decision: Discord)')
assert.match(providers, /['"]discord['"]/, 'Discord must be defined')
assert.match(providers, /['"]google['"]/, 'Google must be defined')

// 4. Zaman asimi sarmalayicisi.
assert.match(
  providers,
  /signInWithOAuthProvider[\s\S]*?withServiceTimeout\(/,
  'the social sign-in call must use a timeout wrapper',
)

// 5. Bayraklar registry'de.
for (const flagKey of ['auth.oauth_google', 'auth.oauth_discord']) {
  assert.ok(
    registry.includes(`'${flagKey}'`),
    `${flagKey} must be registered in the feature flag registry`,
  )
}
// The registry default must be off too; an on record lies that it is "installed".
const googleBlock = registry.slice(registry.indexOf("'auth.oauth_google'"), registry.indexOf("'auth.oauth_discord'"))
assert.match(googleBlock, /varsayilan: false/, 'the registry default must be false')

console.log('PASS social sign-in providers contract kept')
