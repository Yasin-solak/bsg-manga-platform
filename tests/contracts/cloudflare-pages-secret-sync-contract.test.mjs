import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(new URL('../../scripts/sync-cloudflare-pages-secrets.mjs', import.meta.url))
const STUDIO_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'STUDIO_AI_MODEL',
  'STUDIO_AI_IMAGE_DETAIL',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'TRANSLATION_DAILY_USD_CAP',
]
const OTHER_OPTIONAL_KEYS = [
  'VITE_STORE_ASSET_PUBLIC_BASE_URL',
  'VITE_CHAPTER_PAGE_PUBLIC_BASE_URL',
  'VITE_AVATAR_PUBLIC_BASE_URL',
  'VITE_MANGA_COVER_PUBLIC_BASE_URL',
  'VITE_WEB_PUSH_VAPID_PUBLIC_KEY',
  'PUSH_DISPATCH_SECRET',
  'PUSH_VAPID_PUBLIC_KEY',
  'PUSH_VAPID_PRIVATE_KEY',
  'PUSH_VAPID_SUBJECT',
]
const testValues = {
  VITE_SUPABASE_URL: 'https://studio-fixture.example.test',
  VITE_SUPABASE_ANON_KEY: 'ornek-public-anahtar',
  SUPABASE_SERVICE_ROLE_KEY: 'ornek-yalniz-uretim-service-role',
  OPENAI_API_KEY: 'ornek-gizli-model-anahtari',
  STUDIO_AI_MODEL: 'ornek-model',
  STUDIO_AI_IMAGE_DETAIL: 'high',
  ANTHROPIC_API_KEY: 'ornek-gizli-anthropic-anahtari',
  GEMINI_API_KEY: 'ornek-gizli-gemini-anahtari',
  TRANSLATION_DAILY_USD_CAP: '5',
}

function runFixture({ failKey = null, withStudio = true } = {}) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'bsg-studio-secret-sync-'))
  const recordPath = path.join(tempRoot, 'wrangler-calls.jsonl')
  const stubPath = path.join(tempRoot, 'wrangler-stub.mjs')
  const adminPath = path.join(tempRoot, '.env.admin.local')

  try {
    writeFileSync(path.join(tempRoot, '.env'), [
      `VITE_SUPABASE_URL=${testValues.VITE_SUPABASE_URL}`,
      `VITE_SUPABASE_ANON_KEY=${testValues.VITE_SUPABASE_ANON_KEY}`,
    ].join('\n'))
    writeFileSync(path.join(tempRoot, '.env.production'), withStudio ? [
      `OPENAI_API_KEY=${testValues.OPENAI_API_KEY}`,
      `STUDIO_AI_MODEL=${testValues.STUDIO_AI_MODEL}`,
      `STUDIO_AI_IMAGE_DETAIL=${testValues.STUDIO_AI_IMAGE_DETAIL}`,
      `ANTHROPIC_API_KEY=${testValues.ANTHROPIC_API_KEY}`,
      `GEMINI_API_KEY=${testValues.GEMINI_API_KEY}`,
      `TRANSLATION_DAILY_USD_CAP=${testValues.TRANSLATION_DAILY_USD_CAP}`,
    ].join('\n') : '')
    writeFileSync(adminPath, withStudio
      ? `SUPABASE_SERVICE_ROLE_KEY=${testValues.SUPABASE_SERVICE_ROLE_KEY}\n`
      : '')
    writeFileSync(stubPath, `
import fs from 'node:fs'
const args = process.argv.slice(2)
const key = args[args.indexOf('put') + 1]
const envName = args[args.indexOf('--env') + 1]
const input = fs.readFileSync(0, 'utf8')
fs.appendFileSync(process.env.SYNC_RECORD_PATH, JSON.stringify({ key, envName, inputLength: input.length }) + '\\n')
if (key === process.env.SYNC_FAIL_KEY) {
  process.stderr.write(input)
  process.exit(23)
}
`)

    const env = { ...process.env }
    for (const key of [
      ...Object.keys(testValues),
      ...OTHER_OPTIONAL_KEYS,
      'SUPABASE_ADMIN_ENV_FILE', 'npm_execpath', 'SYNC_RECORD_PATH', 'SYNC_FAIL_KEY',
    ]) delete env[key]
    // Admin varsayilan dosyasi fixture disi ek secret getiremesin.
    for (const key of OTHER_OPTIONAL_KEYS) env[key] = ' '
    if (!withStudio) {
      // Empty settings come first so a real user admin file does not mix into the fixture.
      for (const key of STUDIO_KEYS) env[key] = ' '
    }
    Object.assign(env, {
      npm_execpath: stubPath,
      SUPABASE_ADMIN_ENV_FILE: adminPath,
      SYNC_RECORD_PATH: recordPath,
      SYNC_FAIL_KEY: failKey ?? '',
    })

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: tempRoot,
      env,
      encoding: 'utf8',
      timeout: 20_000,
    })
    const calls = existsSync(recordPath)
      ? readFileSync(recordPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
      : []
    return { result, calls }
  } finally {
    const resolved = realpathSync(tempRoot)
    const tempBase = `${realpathSync(os.tmpdir())}${path.sep}`
    assert.ok(resolved.startsWith(tempBase), 'the temporary test path must be in the system temp directory.')
    rmSync(resolved, { recursive: true, force: true })
  }
}

const complete = runFixture()
assert.equal(complete.result.status, 0, complete.result.stderr)
assert.deepEqual(
  complete.calls.filter(({ key }) => STUDIO_KEYS.includes(key)).map(({ key, envName }) => [key, envName]),
  STUDIO_KEYS.map((key) => [key, 'production']),
)
assert.equal(complete.calls.filter(({ envName }) => envName === 'preview').length, 2)
assert.ok(complete.calls.every(({ inputLength }) => inputLength > 0))
assert.doesNotMatch(`${complete.result.stdout}${complete.result.stderr}`, /ornek-yalniz-uretim-service-role|ornek-gizli-model-anahtari|ornek-gizli-anthropic-anahtari|ornek-gizli-gemini-anahtari/)

const withoutStudio = runFixture({ withStudio: false })
assert.equal(withoutStudio.result.status, 0, withoutStudio.result.stderr)
assert.equal(withoutStudio.calls.length, 4)
assert.ok(withoutStudio.calls.every(({ key }) => !STUDIO_KEYS.includes(key)))

const failed = runFixture({ failKey: 'OPENAI_API_KEY' })
assert.equal(failed.result.status, 1)
assert.match(failed.result.stderr, /OPENAI_API_KEY/)
assert.doesNotMatch(`${failed.result.stdout}${failed.result.stderr}`, /ornek-gizli-model-anahtari/)
assert.equal(failed.calls.filter(({ envName }) => envName === 'preview').length, 0)

process.stdout.write('OK Cloudflare Pages secret sync: studio secrets are production only, error output is safe.\n')
