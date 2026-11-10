/**
 * Web push infrastructure contract.
 *
 * Pins:
 * 1) functions/_shared/web-push-crypto.js encryption produces the RFC 8291 Appendix A
 * test vector EXACTLY (the only assurance for handwritten crypto).
 * 2) push-sw.js stays minimal: push + notificationclick PRESENT, NO fetch handler
 * (adding a fetch handler needs a cache strategy design; absent on purpose).
 * 3) manifest.webmanifest keeps installability fields and icon files.
 * 4) /api/push/dispatch secret gate + no service-role policy.
 * 5) Migration 267: RLS, definer trigger, allowlist, flag seed (default off,
 * on conflict does NOT overwrite is_enabled: if an admin turned it on the migration must not turn it off).
 * 6) pushNotificationService flag + timeout + user-facing error conventions.
 * 7) The notification panel renders the opt-in surface; the registry flag record exists.
 */

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const readSource = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

// ---------- 1) RFC 8291 Appendix A test vektoru ----------

const cryptoModule = await import(
  pathToFileURL(path.join(root, 'functions/_shared/web-push-crypto.js')).href
)
const { encryptWebPushPayload, base64UrlToBytes, bytesToBase64Url } = cryptoModule

const VECTOR = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  expected: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

const asPublicBytes = base64UrlToBytes(VECTOR.asPublic)
const applicationServerKeys = {
  privateKey: await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: VECTOR.asPrivate,
      x: bytesToBase64Url(asPublicBytes.slice(1, 33)),
      y: bytesToBase64Url(asPublicBytes.slice(33, 65)),
    },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  ),
  publicKey: await crypto.subtle.importKey(
    'raw',
    asPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  ),
}

const encrypted = await encryptWebPushPayload(
  base64UrlToBytes(VECTOR.plaintext),
  VECTOR.uaPublic,
  VECTOR.authSecret,
  { applicationServerKeys, salt: VECTOR.salt },
)

assert.equal(
  bytesToBase64Url(encrypted),
  VECTOR.expected,
  'web-push encryption must produce the RFC 8291 Appendix A test vector exactly',
)

// ---------- 2) Service worker minimal sozlesmesi ----------

const swSource = readSource('public/push-sw.js')
assert.match(swSource, /addEventListener\(\s*['"]push['"]/, 'push-sw.js push handler icermelidir')
assert.match(swSource, /addEventListener\(\s*['"]notificationclick['"]/, 'push-sw.js notificationclick handler icermelidir')
assert.doesNotMatch(
  swSource,
  /addEventListener\(\s*['"]fetch['"]/,
  'push-sw.js must NOT CONTAIN a fetch handler: a cache/offline layer must be designed as a separate phase with a cache strategy',
)

// ---------- 3) Manifest kurulabilirlik sozlesmesi ----------

const manifest = JSON.parse(readSource('public/manifest.webmanifest'))
assert.equal(manifest.display, 'standalone', 'manifest display must be standalone')
assert.equal(manifest.start_url, '/', 'manifest start_url must be root')
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'manifest en az 3 ikon tanimlamalidir')
for (const icon of manifest.icons) {
  const iconPath = path.join(root, 'public', icon.src.replace(/^\//, ''))
  assert.ok(fs.existsSync(iconPath), `manifest ikonu diskte bulunmalidir: ${icon.src}`)
}
assert.ok(
  manifest.icons.some((icon) => icon.purpose === 'maskable'),
  'manifest maskable ikon icermelidir (Android kurulum kalitesi)',
)

const indexHtml = readSource('index.html')
assert.match(indexHtml, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/, 'index.html manifest linki icermelidir')
assert.match(indexHtml, /<link rel="apple-touch-icon"/, 'index.html must contain apple-touch-icon')

// ---------- 4) Dispatch ucu guvenlik sozlesmesi ----------

const dispatchSource = readSource('functions/api/push/dispatch.js')
assert.match(dispatchSource, /PUSH_DISPATCH_SECRET/, 'the dispatch endpoint must use a secret gate')
assert.match(dispatchSource, /x-push-dispatch-secret/, 'the dispatch endpoint must validate the secret header')
assert.match(dispatchSource, /503/, 'the dispatch endpoint must return 503 when unconfigured')
assert.match(dispatchSource, /405/, 'the dispatch endpoint must return 405 for non-POST methods')
assert.doesNotMatch(
  dispatchSource,
  /SERVICE_ROLE/i,
  'CF functions do not carry service-role (repo policy): subscriptions come in the request body',
)

// ---------- 5) Migration sozlesmesi ----------

const migrationSource = readSource('supabase/migrations/20260708235904_web_push_infrastructure.sql')
assert.match(
  migrationSource,
  /alter table public\.push_subscriptions enable row level security/,
  'push_subscriptions RLS must be on',
)
// Owner-only policies live in migration 270: migration 208 took EXECUTE on
// public.current_public_user_id() from client roles, so
// policies/defaults MUST use the app_private wrapper
// (a direct public.* call gives permission denied even to a signed-in user).
const rlsFixSource = readSource('supabase/migrations/20260708235907_web_push_rls_helper_fix.sql')
assert.match(
  rlsFixSource,
  /alter column user_id set default app_private\.current_public_user_id\(\)/,
  'push_subscriptions user_id default app_private sarmalayicisini kullanmalidir',
)
for (const policyName of [
  'push_subscriptions_select_own',
  'push_subscriptions_insert_own',
  'push_subscriptions_update_own',
  'push_subscriptions_delete_own',
]) {
  assert.match(
    rlsFixSource,
    new RegExp(`create policy ${policyName}[\\s\\S]*?user_id = app_private\\.current_public_user_id\\(\\)`),
    `the ${policyName} policy must be owner-only with an app_private helper`,
  )
}
assert.match(migrationSource, /security definer/, 'the dispatch trigger function must be definer (reads config + subscriptions)')
assert.match(
  migrationSource,
  /exception when others then[\s\S]*?return new/,
  'a dispatch trigger error must never block the notification insert',
)
assert.match(migrationSource, /'fansub_new_chapter'/, 'the allowlist default must include the new chapter event')
assert.match(migrationSource, /'notifications\.web_push'/, 'migration feature flag seed etmelidir')
const flagConflictClause = migrationSource.slice(migrationSource.lastIndexOf('on conflict (key) do update'))
assert.doesNotMatch(
  flagConflictClause,
  /is_enabled\s*=\s*excluded\.is_enabled/,
  'flag seed on-conflict must NOT OVERWRITE is_enabled: a rerun migration must not close a flag an admin opened',
)

// ---------- 6) Istemci servis konvansiyonlari ----------

const serviceSource = readSource('src/services/pushNotificationService.ts')
assert.match(serviceSource, /'notifications\.web_push'/, 'the service must use a feature flag gate')
assert.match(serviceSource, /withServiceTimeout/, 'the service must wrap supabase calls with withServiceTimeout')
assert.match(serviceSource, /toUserFacingErrorMessage/, 'the service must convert errors to a user-facing message')
assert.match(serviceSource, /VITE_WEB_PUSH_VAPID_PUBLIC_KEY/, 'servis VAPID public key ortam degiskenini okumalidir')
assert.match(serviceSource, /'\/push-sw\.js'/, 'servis push-sw.js yolunu kullanmalidir')

// ---------- 7) UI yuzeyi + registry ----------

const notificationSettingsSource = readSource('src/components/notifications/NotificationSettings.tsx')
assert.match(notificationSettingsSource, /<PushNotificationOptIn \/>/, 'notification settings must render the push opt-in surface')

const registrySource = readSource('src/services/featureFlagRegistry.ts')
assert.match(registrySource, /'notifications\.web_push'/, 'feature flag registry web_push kaydini icermelidir')

// ---------- 8) Chapter end adoption nudge ----------
// Intent: the suggestion shows ONCE (localStorage guard), subscribes with one click,
// falls to install instructions in an iOS browser tab. The reader chapter end
// block renders the nudge.

const nudgeSource = readSource('src/components/common/PushAdoptionNudge.tsx')
assert.match(nudgeSource, /mz-push-nudge/, 'the nudge must use a localStorage guard key (show once)')
assert.match(nudgeSource, /getWebPushState/, 'the nudge must query the real subscription state')
assert.match(nudgeSource, /enableWebPush/, 'the nudge must use the one-click subscribe flow')
assert.match(nudgeSource, /isIosBrowserTab/, 'the nudge must contain an install variant for an iOS browser tab')
assert.match(
  nudgeSource,
  /writeNudgeState\('dismissed'\)/,
  'a closed nudge must stay silent permanently',
)

const readerSupplementarySource = readSource('src/pages/mangaReader/ReaderSupplementaryContent.tsx')
assert.match(
  readerSupplementarySource,
  /<PushAdoptionNudge/,
  'the reader chapter end block must render the push adoption nudge surface',
)

console.log('PASS web push infrastructure contract kept (including the RFC 8291 vector)')
