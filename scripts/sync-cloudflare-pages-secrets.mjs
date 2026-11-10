import fs from 'node:fs'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { loadProjectEnv } from './lib/project-env.mjs'

const REQUIRED_VITE_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
const OPTIONAL_VITE_KEYS = [
  'VITE_STORE_ASSET_PUBLIC_BASE_URL',
  'VITE_CHAPTER_PAGE_PUBLIC_BASE_URL',
  'VITE_AVATAR_PUBLIC_BASE_URL',
  'VITE_MANGA_COVER_PUBLIC_BASE_URL',
  'VITE_WEB_PUSH_VAPID_PUBLIC_KEY',
]
// Sunucu tarafi (functions/) secret'lari; VITE_ degildir, client bundle'a girmez.
// Uretim: node scripts/generate-vapid-keys.mjs
const OPTIONAL_SERVER_KEYS = [
  'PUSH_DISPATCH_SECRET',
  'PUSH_VAPID_PUBLIC_KEY',
  'PUSH_VAPID_PRIVATE_KEY',
  'PUSH_VAPID_SUBJECT',
]
// Studio server settings are written only to production so live DB access does not move to the preview environment.
const PRODUCTION_STUDIO_SERVER_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'STUDIO_AI_MODEL',
  'STUDIO_AI_IMAGE_DETAIL',
  // Translation Studio V3 multi-model routing and daily budget.
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'TRANSLATION_DAILY_USD_CAP',
]
const TARGET_ENVS = ['production', 'preview']

function runWrangler(args, { input = '' } = {}) {
  const npmExecPath = process.env.npm_execpath
  if (!npmExecPath || !fs.existsSync(npmExecPath)) {
    throw new Error('npm_execpath not found. Run this script with `npm run cf:sync-secrets`.')
  }

  const result = spawnSync(process.execPath, [npmExecPath, 'exec', '--', 'wrangler', ...args], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  if (result.error) {
    throw new Error('Wrangler could not run; check identity and connection separately.')
  }

  return result
}

function runWranglerSecretPut({ projectName, envName, key, value }) {
  const result = runWrangler(
    ['pages', 'secret', 'put', key, '--project-name', projectName, '--env', envName],
    { input: value },
  )

  if (result.status !== 0) {
    // Wrangler output can echo input; never add a secret value to an error message.
    throw new Error(`Secret write error (${envName}/${key}), exit code: ${result.status ?? 'unknown'}`)
  }
}

function requireValue(key) {
  const value = process.env[key]
  if (!value || !value.trim()) {
    throw new Error(`Eksik zorunlu degisken: ${key}`)
  }
  return value.trim()
}

function optionalValue(key) {
  const value = process.env[key]
  if (!value || !value.trim()) return null
  return value.trim()
}

async function main() {
  const cwd = process.cwd()
  loadProjectEnv({ cwd, includeProduction: true, includeAdmin: true })

  const projectName = process.env.CF_PAGES_PROJECT_NAME?.trim() || 'bsgmanga'
  const secretMap = new Map()

  for (const key of REQUIRED_VITE_KEYS) {
    secretMap.set(key, requireValue(key))
  }
  for (const key of [...OPTIONAL_VITE_KEYS, ...OPTIONAL_SERVER_KEYS]) {
    const value = optionalValue(key)
    if (value) secretMap.set(key, value)
  }
  const productionStudioSecrets = new Map()
  for (const key of PRODUCTION_STUDIO_SERVER_KEYS) {
    const value = optionalValue(key)
    if (value) productionStudioSecrets.set(key, value)
  }

  for (const envName of TARGET_ENVS) {
    const envSecrets = envName === 'production'
      ? [...secretMap.entries(), ...productionStudioSecrets.entries()]
      : secretMap.entries()
    for (const [key, value] of envSecrets) {
      process.stdout.write(`[cf:sync-secrets] ${envName}/${key} yaziliyor...\n`)
      runWranglerSecretPut({ projectName, envName, key, value })
    }
  }

  process.stdout.write('[cf:sync-secrets] Tamamlandi.\n')
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[cf:sync-secrets] ERROR: ${message}`)
  process.exit(1)
})
