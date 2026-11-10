import { promises as fs } from 'node:fs'
import path from 'node:path'
import { loadProjectEnv } from './lib/project-env.mjs'
import {
  assertBuiltMediaConfiguration,
  assertProductionMediaBases,
  loadProductionFrontendEnv,
} from './lib/production-media-precheck.mjs'

const DIST_DIR = path.resolve(process.cwd(), 'dist')
const REQUIRED_FRONTEND_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
const FORBIDDEN_DIST_PATHS = [
  /^\.env(\.|$)/i,
  /^docs\//i,
  /^\.agent\//i,
  /^supabase\//i,
  /^tests?\//i,
  /^supabasebilgileri\.txt$/i,
  /^supabasebilgi\.md$/i,
]
const TEXT_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.txt',
  '.svg',
  '.xml',
  '.map',
  '.webmanifest',
])

function info(message) {
  console.log(`[predeploy:cf] ${message}`)
}

function fail(message) {
  throw new Error(message)
}

function getVariable(key) {
  const runtimeValue = process.env[key]
  if (typeof runtimeValue === 'string' && runtimeValue.trim()) return runtimeValue.trim()
  return ''
}

async function ensureDistExists() {
  try {
    const stat = await fs.stat(DIST_DIR)
    if (!stat.isDirectory()) {
      fail('dist folder not found. Run `npm run build` first.')
    }
  } catch {
    fail('dist folder not found. Run `npm run build` first.')
  }
}

async function walkDirectory(rootDir) {
  const stack = [rootDir]
  const files = []

  while (stack.length > 0) {
    const currentDir = stack.pop()
    const entries = await fs.readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const absPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        stack.push(absPath)
        continue
      }
      if (entry.isFile()) {
        files.push(absPath)
      }
    }
  }

  return files
}

function assertRequiredFrontendEnv(frontendEnv) {
  for (const key of REQUIRED_FRONTEND_ENV) {
    const value = frontendEnv[key]?.trim() || ''
    if (!value) {
      fail(`${key} is not defined. Fill in frontend env values before the Cloudflare deploy.`)
    }
    if (/your-project-ref|your-public-anon-key/i.test(value)) {
      fail(`${key} placeholder degeri iceriyor. Gercek deger olmadan deploy etmeyin.`)
    }
  }
}

function assertForbiddenPath(relativePath) {
  for (const pattern of FORBIDDEN_DIST_PATHS) {
    if (pattern.test(relativePath)) {
      fail(`dist icinde deploy edilmemesi gereken dosya bulundu: ${relativePath}`)
    }
  }
}

function assertNoSourcemap(relativePath) {
  if (relativePath.toLowerCase().endsWith('.map')) {
    fail(`Source map file found (${relativePath}). Do not publish source maps in production.`)
  }
}

function assertNoSecretText(relativePath, content, serviceRoleValue) {
  if (/SUPABASE_SERVICE_ROLE_KEY/i.test(content)) {
    fail(`dist icinde SUPABASE_SERVICE_ROLE_KEY ifadesi bulundu: ${relativePath}`)
  }
  if (/-----BEGIN [A-Z ]+PRIVATE KEY-----/i.test(content)) {
    fail(`dist icinde private key deseni bulundu: ${relativePath}`)
  }
  if (serviceRoleValue && content.includes(serviceRoleValue)) {
    fail(`dist icinde SUPABASE_SERVICE_ROLE_KEY degeri bulundu: ${relativePath}`)
  }
}

async function assertDistSafety(mediaBases) {
  const files = await walkDirectory(DIST_DIR)
  const serviceRoleValue = getVariable('SUPABASE_SERVICE_ROLE_KEY')
  let hasRedirects = false
  const clientScripts = []

  for (const absPath of files) {
    const relativePath = path.relative(DIST_DIR, absPath).replace(/\\/g, '/')
    if (relativePath === '_redirects') {
      hasRedirects = true
    }

    assertForbiddenPath(relativePath)
    assertNoSourcemap(relativePath)

    const ext = path.extname(relativePath).toLowerCase()
    if (!TEXT_EXTENSIONS.has(ext)) continue

    const content = await fs.readFile(absPath, 'utf8')
    assertNoSecretText(relativePath, content, serviceRoleValue)
    if (relativePath.startsWith('assets/') && (ext === '.js' || ext === '.mjs')) {
      clientScripts.push({ relativePath, content })
    }
  }

  if (!hasRedirects) {
    fail('dist/_redirects bulunamadi. SPA fallback bozulabilir.')
  }
  assertBuiltMediaConfiguration(clientScripts, mediaBases)
}

async function main() {
  info('Cloudflare deploy guvenlik kontrolleri basladi.')
  // We take Vite's production values before the old helper fills process.env.
  const frontendEnv = loadProductionFrontendEnv(process.cwd())
  loadProjectEnv({ cwd: process.cwd(), includeProduction: true, includeAdmin: true })

  assertRequiredFrontendEnv(frontendEnv)
  const mediaBases = assertProductionMediaBases(frontendEnv)
  await ensureDistExists()
  await assertDistSafety(mediaBases)

  info('Tum kontroller basarili. Deploy guvenli gorunuyor.')
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[predeploy:cf] ERROR: ${message}`)
  process.exit(1)
})
