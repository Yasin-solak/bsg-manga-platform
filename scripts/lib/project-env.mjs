import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

function parseEnvContent(raw) {
  const entries = []

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const index = trimmed.indexOf('=')
    if (index <= 0) continue

    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    entries.push([key, value])
  }

  return entries
}

export function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false

  const content = fs.readFileSync(filePath, 'utf8')
  for (const [key, value] of parseEnvContent(content)) {
    if (!process.env[key]) {
      process.env[key] = value
    }
  }

  return true
}

export function getDefaultAdminEnvFilePath() {
  return path.join(os.homedir(), '.bsgmanga', 'supabase-admin.env')
}

function resolveAdminEnvCandidates(cwd) {
  const candidates = []
  const configuredPath = process.env.SUPABASE_ADMIN_ENV_FILE?.trim()

  if (configuredPath) {
    candidates.push(path.isAbsolute(configuredPath) ? configuredPath : path.join(cwd, configuredPath))
  }

  const defaults = [
    getDefaultAdminEnvFilePath(),
    path.join(cwd, '.env.admin.local'),
  ]

  for (const filePath of defaults) {
    if (!candidates.includes(filePath)) {
      candidates.push(filePath)
    }
  }

  return candidates
}

export function loadProjectEnv(options = {}) {
  const cwd = options.cwd || process.cwd()
  const includeProduction = options.includeProduction === true
  const includeAdmin = options.includeAdmin === true

  const candidates = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local'),
  ]

  if (includeProduction) {
    candidates.push(path.join(cwd, '.env.production'))
  }

  if (includeAdmin) {
    candidates.push(...resolveAdminEnvCandidates(cwd))
  }

  const loadedFiles = []
  for (const filePath of candidates) {
    if (loadEnvFile(filePath)) {
      loadedFiles.push(filePath)
    }
  }

  return loadedFiles
}

export function getAdminEnvSetupHint() {
  return `SUPABASE_ADMIN_ENV_FILE veya ${getDefaultAdminEnvFilePath()} kullanin.`
}
