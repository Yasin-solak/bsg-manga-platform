/**
 * Password policy and leaked password check contract.
 *
 * **Why this file exists.** Supabase's built-in leaked password protection needs the Pro plan
 * and the project has no plan; we build the same protection ourselves. Since we built it
 * we must have a machine verify it, especially
 * the PRIVACY side: the whole password or full hash must never reach the network.
 *
 * Separate file: deep-audit matches a `src/lib/*` module by a file name token.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

function loadModule(relativePath) {
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  // Dependencies (logger etc.) do not matter for the contract: each import returns an empty callable
  // object. Loading real dependencies would make the test fragile.
  const stub = new Proxy({}, {
    get: () => new Proxy(() => ({ warn() {}, error() {}, info() {} }), { get: () => () => {} }),
  })
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, (id) => (id === '@/i18n/activeLocale' ? { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) } : stub))
  return shim.exports
}

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const policy = loadModule('src/lib/passwordPolicy.ts')

// ---------- A) Policy ----------
// The only rule used to be `password.length < 6`; Supabase's docs advise against going below 8.
assert.equal(policy.MIN_PASSWORD_LENGTH, 8, 'minimum length must be 8')
assert.deepEqual(policy.checkPasswordPolicy({ password: 'abcdefgh' }), [], 'gecerli parola sorun uretmemeli')
assert.deepEqual(policy.checkPasswordPolicy({ password: 'abc1234' }), ['cok_kisa'], '7 characters must be short')

// A length requirement alone is not enough: "aaaaaaaa" would pass with near zero entropy.
assert.deepEqual(
  policy.checkPasswordPolicy({ password: 'aaaaaaaa' }),
  ['tek_karakter'],
  'repeats of a single character must be rejected',
)

// Identity must not appear in the password: even without a leak it is the easiest guess.
assert.deepEqual(
  policy.checkPasswordPolicy({ password: 'demo12345', username: 'demo' }),
  ['kimlik_iceriyor'],
  'a password containing the username must be rejected',
)
assert.deepEqual(
  policy.checkPasswordPolicy({ password: 'site_owner-parola', email: 'site_owner@example.com' }),
  ['kimlik_iceriyor'],
  'e-posta yerel parcasi iceren parola reddedilmeli',
)
// Identity matching under three letters gives false alarms ("al", not "ali").
assert.deepEqual(
  policy.checkPasswordPolicy({ password: 'alqweasdzxc', username: 'al' }),
  [],
  'a very short identity piece must not raise a false alarm',
)

// bcrypt ignores everything past 72 bytes; rejected rather than silently cut.
assert.deepEqual(
  policy.checkPasswordPolicy({ password: 'a'.repeat(80) + 'B1' }),
  ['cok_uzun'],
  'a password over 72 characters must be rejected',
)

// ALL problems must return at once: stopping at the first error makes the password get fixed twice.
assert.ok(
  policy.checkPasswordPolicy({ password: 'yas', username: 'yas' }).length >= 2,
  'sorunlar birlikte bildirilmeli',
)

// Composition rules (uppercase/digit/symbol required) are DELIBERATELY ABSENT: NIST 800-63B
// dropped them, they push users to `Parola1!` patterns. This pin makes visible anyone
// adding them back to "improve security".
assert.deepEqual(
  policy.checkPasswordPolicy({ password: 'correcthorsebattery' }),
  [],
  'a long symbol-free password must not be rejected (no composition rule)',
)

// Modul SAF kalmali: politika ag ya da tarayici bilmeden test edilebilmeli.
assert.doesNotMatch(
  stripComments(read('src/lib/passwordPolicy.ts')),
  /\bfetch\(|\bwindow\b|\bdocument\b|crypto/,
  'the policy module must not know network/browser',
)

// ---------- B) Sizmis parola: GIZLILIK ----------
const leaked = read('src/services/leakedPasswordService.ts')
const leakedCode = stripComments(leaked)

// B1) k-anonymity protocol: only the FIRST 5 DIGITS of the hash are sent.
// Read from source: loading the module would also load zod, and the
// contract should not get stuck on a dependency chain.
assert.match(leaked, /export const HASH_PREFIX_LENGTH = 5/, 'HIBP protokolu 5 haneli onek ister')
assert.match(leakedCode, /const prefix = hash\.slice\(0, HASH_PREFIX_LENGTH\)/, 'the prefix must come from the digest start')
assert.match(leakedCode, /\$\{HIBP_RANGE_ENDPOINT\}\$\{prefix\}/, 'ONLY the prefix must go to the network')

// B2) THE MOST CRITICAL PIN: the password itself or its FULL hash must not go in the request.
// Sending the full hash would turn this protection into a password leak channel.
assert.doesNotMatch(leakedCode, /body:\s*/, 'the request must have no body (GET, prefix only)')
assert.doesNotMatch(
  leakedCode,
  /\$\{hash\}|\+ hash\b|\bhash\)/,
  'the full digest must not go into the request',
)
assert.doesNotMatch(leakedCode, /\$\{password\}/, 'parola istege konmamali')

// B3) Matching must happen IN THE BROWSER; the server cannot know which password we asked about.
assert.match(leakedCode, /rawSuffix !== suffix/, 'eslesme yerelde yapilmali')

// B4) FAILS OPEN: a third-party service outage should not stop the signup flow.
assert.match(leakedCode, /catch \(error\)[\s\S]{0,220}checked: false/, 'on error it must count as not checked')
assert.match(leakedCode, /!response\.ok\) return \{ leaked: false/, 'basarisiz cevap engellememeli')

// B5) There must be a timeout: the signup flow should not wait on a third-party service.
assert.match(leakedCode, /AbortController/, 'the request must be tied to a timeout')

// B6) Dolgu satirlari gercek eslesme sayilmamali (HIBP `Add-Padding` sifir
// sayili sahte satirlar dondurur; sayilsa her parola "sizmis" gorunurdu).
assert.match(leakedCode, /count <= 0\) break/, 'dolgu satiri eslesme sayilmamali')
assert.match(leakedCode, /'Add-Padding': 'true'/, 'dolgu istenmeli (cevap boyutu bilgi sizdirmasin)')

// ---------- C) Kayit akisina bagli ----------
const authPage = stripComments(read('src/pages/AuthPage.tsx'))
assert.match(authPage, /checkPasswordPolicy\(\{ password, username: normalizedUsername, email \}\)/,
  'the policy must run in signup validation')
// Sizmis denetimi `validate` icinde OLAMAZ: denetim ag istegi, validate senkron.
assert.match(authPage, /await checkLeakedPassword\(password\)/, 'the leak check must run at signup time')
// Only the `validate` BODY is inspected; import lines naturally contain the name.
const validateBody = authPage.split('const validate = () => {')[1]?.split('const handleSubmit')[0] ?? ''
assert.ok(validateBody.length > 0, 'validate govdesi bulunmali (pin olu olmasin)')
assert.doesNotMatch(
  validateBody,
  /checkLeakedPassword/,
  'sizmis denetimi senkron validate icine konmamali',
)

console.log('PASS password policy and leaked password contract verified')
