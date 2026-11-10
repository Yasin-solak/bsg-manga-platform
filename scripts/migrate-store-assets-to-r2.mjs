import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

const DEFAULT_SOURCE_BUCKET = 'store-assets'
const DEFAULT_TARGET_BUCKET = 'store-assets'
const DEFAULT_RETRY = 3
const DEFAULT_RETRY_WAIT_MS = 450
const DEFAULT_SIGNED_URL_TTL_SEC = 120

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry(taskName, fn, options = {}) {
  const retryCount = options.retryCount ?? DEFAULT_RETRY
  const waitMs = options.waitMs ?? DEFAULT_RETRY_WAIT_MS
  let lastError = null

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= retryCount) break
      console.warn(`[retry] ${taskName} fail (${attempt}/${retryCount}), retrying...`)
      await delay(waitMs * attempt)
    }
  }

  throw lastError
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const flags = new Set(args.filter((x) => x.startsWith('--')))

  const readOption = (prefix) => {
    const found = args.find((arg) => arg.startsWith(`${prefix}=`))
    if (!found) return null
    return found.slice(prefix.length + 1).trim()
  }

  const limitRaw = readOption('--limit')
  const parsedLimit = limitRaw ? Number(limitRaw) : null

  return {
    apply: flags.has('--apply'),
    prefix: readOption('--prefix') || '',
    sourceBucket: readOption('--source-bucket') || process.env.SUPABASE_SOURCE_BUCKET || DEFAULT_SOURCE_BUCKET,
    targetBucket: readOption('--target-bucket') || process.env.CF_R2_TARGET_BUCKET || DEFAULT_TARGET_BUCKET,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : null,
  }
}

function normalizePath(value) {
  if (!value || typeof value !== 'string') return null
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/')
  return normalized || null
}

async function listAllBucketObjects(supabase, sourceBucket) {
  const files = new Set()
  const queue = ['']

  while (queue.length > 0) {
    const currentPrefix = queue.shift() || ''
    let offset = 0
    const pageLimit = 100

    while (true) {
      const { data, error } = await withRetry(
        `list:${currentPrefix || '<root>'}:${offset}`,
        () => supabase.storage.from(sourceBucket).list(currentPrefix, {
          limit: pageLimit,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        }),
      )

      if (error) throw error
      if (!data || data.length === 0) break

      for (const entry of data) {
        if (!entry?.name) continue
        const childPath = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name
        const isFolder = !entry.metadata
        if (isFolder) {
          queue.push(childPath)
        } else {
          const normalized = normalizePath(childPath)
          if (normalized) files.add(normalized)
        }
      }

      if (data.length < pageLimit) break
      offset += pageLimit
    }
  }

  return Array.from(files).sort((a, b) => a.localeCompare(b))
}

function runWrangler(args, options = {}) {
  const npmExecPath = process.env.npm_execpath
  if (!npmExecPath || !fs.existsSync(npmExecPath)) {
    throw new Error('npm_execpath not found. Run this script with `npm run r2:migrate:store-assets:dry` or `apply`.')
  }

  const result = spawnSync(process.execPath, [npmExecPath, 'exec', '--', 'wrangler', ...args], {
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  })

  if (result.error) {
    throw new Error(`wrangler could not run: ${String(result.error)}`)
  }

  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim()
    throw new Error(`wrangler ${args.join(' ')} error: ${message}`)
  }

  return result.stdout || ''
}

function ensureR2EnabledAndBucketReady(targetBucket, applyMode) {
  try {
    const output = runWrangler(['r2', 'bucket', 'list'])
    if (output.includes(targetBucket)) {
      return
    }

    if (!applyMode) {
      console.warn(`[warn] R2 bucket not found: ${targetBucket} (not created in dry-run)`)
      return
    }

    console.log(`[info] Creating R2 bucket: ${targetBucket}`)
    runWrangler(['r2', 'bucket', 'create', targetBucket], { stdio: ['ignore', 'inherit', 'inherit'] })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('code: 10042') || message.toLowerCase().includes('enable r2')) {
      throw new Error('R2 is not active for the Cloudflare account. Enable R2 first with Dashboard > R2 > Get started.')
    }
    throw error
  }
}

async function fetchBufferFromUrl(url, taskName) {
  const response = await withRetry(taskName, async () => {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    return res
  })

  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || null,
  }
}

async function downloadSupabaseObject(supabase, sourceBucket, objectPath) {
  const { data: publicUrlData } = supabase.storage.from(sourceBucket).getPublicUrl(objectPath)
  const publicUrl = publicUrlData?.publicUrl

  if (publicUrl) {
    try {
      return await fetchBufferFromUrl(publicUrl, `download-public:${objectPath}`)
    } catch {
      // public URL fail olursa signed URL fallback
    }
  }

  const { data: signedData, error: signedError } = await supabase
    .storage
    .from(sourceBucket)
    .createSignedUrl(objectPath, DEFAULT_SIGNED_URL_TTL_SEC)

  if (signedError || !signedData?.signedUrl) {
    throw new Error(`Signed URL uretilemedi: ${objectPath}`)
  }

  return fetchBufferFromUrl(signedData.signedUrl, `download-signed:${objectPath}`)
}

function writeTempFile(buffer, objectPath) {
  const safeName = objectPath.replace(/[^\w.-]+/g, '_')
  const filePath = path.join(os.tmpdir(), `r2-migrate-${Date.now()}-${safeName}`)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

function uploadToR2(targetBucket, objectPath, filePath, contentType) {
  // Why: the backfill result must be written to the real remote Cloudflare R2 bucket, not only locally.
  const args = ['r2', 'object', 'put', `${targetBucket}/${objectPath}`, '--remote', '--file', filePath]
  if (contentType) {
    args.push('--content-type', contentType)
  }
  runWrangler(args)
}

async function main() {
  const cwd = process.cwd()
  loadProjectEnv({ cwd, includeProduction: true, includeAdmin: true })

  const options = parseArgs(process.argv)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(`SUPABASE_URL/VITE_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY zorunludur. ${getAdminEnvSetupHint()}`)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`[info] mod=${options.apply ? 'apply' : 'dry-run'}`)
  console.log(`[info] source bucket=${options.sourceBucket}, target bucket=${options.targetBucket}`)
  if (options.prefix) {
    console.log(`[info] prefix filtresi=${options.prefix}`)
  }
  if (options.limit) {
    console.log(`[info] limit=${options.limit}`)
  }

  ensureR2EnabledAndBucketReady(options.targetBucket, options.apply)

  console.log('[info] Listing Supabase bucket objects...')
  let objectPaths = await listAllBucketObjects(supabase, options.sourceBucket)
  if (options.prefix) {
    objectPaths = objectPaths.filter((pathValue) => pathValue.startsWith(options.prefix))
  }
  if (options.limit) {
    objectPaths = objectPaths.slice(0, options.limit)
  }

  if (objectPaths.length === 0) {
    console.log('[done] Tasinacak dosya bulunamadi.')
    return
  }

  console.log(`[info] aday dosya sayisi=${objectPaths.length}`)

  if (!options.apply) {
    for (const sample of objectPaths.slice(0, 20)) {
      console.log(`[dry-run] ${options.sourceBucket}/${sample} -> ${options.targetBucket}/${sample}`)
    }
    console.log('[done] dry-run tamamlandi. Gercek tasima icin: npm run r2:migrate:store-assets:apply')
    return
  }

  let uploaded = 0
  const failed = []

  for (let i = 0; i < objectPaths.length; i += 1) {
    const objectPath = objectPaths[i]
    const progress = `${i + 1}/${objectPaths.length}`
    let tmpPath = null

    try {
      const payload = await downloadSupabaseObject(supabase, options.sourceBucket, objectPath)
      tmpPath = writeTempFile(payload.buffer, objectPath)
      uploadToR2(options.targetBucket, objectPath, tmpPath, payload.contentType)
      uploaded += 1
      console.log(`[ok] ${progress} ${objectPath}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failed.push({ objectPath, message })
      console.error(`[fail] ${progress} ${objectPath} :: ${message}`)
    } finally {
      if (tmpPath && fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath)
      }
    }
  }

  console.log('\n--- Summary ---')
  console.log(`toplam aday: ${objectPaths.length}`)
  console.log(`basarili upload: ${uploaded}`)
  console.log(`failed uploads: ${failed.length}`)

  if (failed.length > 0) {
    console.log('\n--- Error Samples ---')
    for (const item of failed.slice(0, 15)) {
      console.log(`${item.objectPath} :: ${item.message}`)
    }
    process.exitCode = 1
    return
  }

  console.log('[done] Supabase store-assets -> Cloudflare R2 tasima tamamlandi.')
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[r2:migrate] ERROR: ${message}`)
  process.exit(1)
})
