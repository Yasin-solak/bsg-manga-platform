import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const profileId = '11111111-1111-4111-8111-111111111111'
const authId = '22222222-2222-4222-8222-222222222222'
let submitted = null
const mocks = {
  react: { useCallback: fn => fn, useEffect: () => {}, useState: initial => [initial, () => {}] },
  '@/contexts/AuthContext': { useAuth: () => ({ currentUser: { id: profileId, authUserId: authId } }) },
  '@/services/linkedAccountService': { beginDiscordLink: async id => { submitted = id }, readLinkedAccountState: async () => ({ userId: authId, discord: null }) },
  '@/services/userFacingError': { toUserFacingErrorMessage: () => '' },
  '@/components/ui/button': { Button: () => null }, '@phosphor-icons/react': { DiscordLogo: () => null },
}
const source = readFileSync(new URL('../../src/components/layout/account/LinkedDiscordAccount.tsx', import.meta.url), 'utf8')
const exports = {}
new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText)(name => (name === '@/i18n/activeLocale' ? { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) } : mocks[name] || require(name)), exports)
const view = exports.LinkedDiscordAccount()
view.props.onLink()
await Promise.resolve()
assert.equal(submitted, authId, 'with profile UUID and Auth UUID different the Auth identity must be sent')
assert.notEqual(submitted, profileId)
console.log('PASS Discord link UI boundary sends the Auth identity rather than the profile identity')
