import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

const DEFAULT_RETRY = 3
const DEFAULT_RETRY_WAIT_MS = 450
const PAGE_SIZE = 1000

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif']

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
  const only = (readOption('--only') || 'all').trim().toLowerCase()

  if (!['all', 'avatars', 'covers'].includes(only)) {
    throw new Error('--only can only be all, avatars or covers.')
  }

  return {
    apply: flags.has('--apply'),
    only,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : null,
  }
}

function normalizePath(value) {
  if (!value || typeof value !== 'string') return null
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/')
  return normalized || null
}

function ensureRequiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} zorunludur.`)
  }
  return value
}

function runWrangler(args, options = {}) {
  const npmExecPath = process.env.npm_execpath
  if (!npmExecPath || !fs.existsSync(npmExecPath)) {
    throw new Error('npm_execpath not found. Run this script through npm run.')
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

function writeTempFile(buffer, objectPath) {
  const safeName = objectPath.replace(/[^\w.-]+/g, '_')
  const filePath = path.join(os.tmpdir(), `r2-legacy-media-${Date.now()}-${safeName}`)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

function uploadToR2(targetBucket, objectPath, filePath, contentType) {
  const args = ['r2', 'object', 'put', `${targetBucket}/${objectPath}`, '--remote', '--file', filePath]
  if (contentType) {
    args.push('--content-type', contentType)
  }
  runWrangler(args)
}

function deleteTargetVariants(targetBucket, objectPath) {
  const dotIndex = objectPath.lastIndexOf('.')
  if (dotIndex < 0) return

  const stem = objectPath.slice(0, dotIndex)
  const ext = objectPath.slice(dotIndex + 1).toLowerCase()

  for (const candidate of IMAGE_EXTENSIONS) {
    if (candidate === ext) continue
    try {
      runWrangler(['r2', 'object', 'delete', `${targetBucket}/${stem}.${candidate}`, '--remote'])
    } catch {
      // Neden: varyant temizligi idempotent olmali; dosya yoksa migrasyon durmamalidir.
    }
  }
}

function parseSupabaseStorageObjectPath(urlString, bucket) {
  if (!urlString || typeof urlString !== 'string') return null

  try {
    const url = new URL(urlString)
    const match = url.pathname.match(new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/(.+)$`, 'i'))
    if (!match?.[1]) return null
    return normalizePath(match[1])
  } catch {
    return null
  }
}

function getFileExtension(objectPath, contentType) {
  const rawExt = objectPath.includes('.') ? objectPath.split('.').pop()?.toLowerCase() : null
  if (rawExt) return rawExt

  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }

  return mimeMap[contentType || ''] || 'bin'
}

function buildPublicUrl(baseUrl, objectPath) {
  return `${baseUrl.replace(/\/+$/, '')}/${objectPath.replace(/^\/+/, '')}`
}

function formatErrorMessage(error) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

async function selectAllRows(supabase, table, selectClause, filterBuilder) {
  const rows = []
  let offset = 0

  while (true) {
    let query = supabase.from(table).select(selectClause).range(offset, offset + PAGE_SIZE - 1)
    query = filterBuilder(query)
    const { data, error } = await query

    if (error) throw error
    if (!data || data.length === 0) break

    rows.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

const TARGETS = [
  {
    key: 'users.avatar_url',
    category: 'avatars',
    table: 'users',
    column: 'avatar_url',
    sourceBucket: 'avatars',
    targetBucket: 'avatars',
    publicBaseEnv: 'VITE_AVATAR_PUBLIC_BASE_URL',
    select: 'id, auth_user_id, username, avatar_url',
    filter(query) {
      return query.like('avatar_url', '%supabase.co/storage/v1/object/public/avatars/%')
    },
    buildTargetObjectPath(row, extension) {
      if (!row.auth_user_id) {
        throw new Error(`users.id=${row.id} icin auth_user_id eksik.`)
      }
      return `users/${row.auth_user_id}/avatar.${extension}`
    },
  },
  {
    key: 'fansubs.avatar_url',
    category: 'avatars',
    table: 'fansubs',
    column: 'avatar_url',
    sourceBucket: 'avatars',
    targetBucket: 'avatars',
    publicBaseEnv: 'VITE_AVATAR_PUBLIC_BASE_URL',
    select: 'id, slug, avatar_url',
    filter(query) {
      return query.like('avatar_url', '%supabase.co/storage/v1/object/public/avatars/%')
    },
    buildTargetObjectPath(row, extension) {
      return `fansubs/${row.id}/avatar.${extension}`
    },
  },
  {
    key: 'fansub_requests.requested_avatar_url',
    category: 'avatars',
    table: 'fansub_requests',
    column: 'requested_avatar_url',
    sourceBucket: 'avatars',
    targetBucket: 'avatars',
    publicBaseEnv: 'VITE_AVATAR_PUBLIC_BASE_URL',
    select: 'id, requester_user_id, requested_slug, requested_avatar_url, status, created_fansub_id',
    filter(query) {
      return query.like('requested_avatar_url', '%supabase.co/storage/v1/object/public/avatars/%')
    },
    buildTargetObjectPath(row, extension) {
      return `fansub-requests/${row.id}/avatar.${extension}`
    },
  },
  {
    key: 'mangas.cover_image_url',
    category: 'covers',
    table: 'mangas',
    column: 'cover_image_url',
    sourceBucket: 'manga-covers',
    targetBucket: 'manga-covers',
    publicBaseEnv: 'VITE_MANGA_COVER_PUBLIC_BASE_URL',
    select: 'id, fansub_id, slug, cover_image_url',
    filter(query) {
      return query.like('cover_image_url', '%supabase.co/storage/v1/object/public/manga-covers/%')
    },
    buildTargetObjectPath(row, extension) {
      if (row.fansub_id) {
        return `fansubs/${row.fansub_id}/mangas/${row.id}/cover.${extension}`
      }
      return `mangas/${row.id}/cover.${extension}`
    },
  },
]

async function collectMigrationJobs(supabase, options) {
  const jobs = []

  for (const target of TARGETS) {
    if (options.only !== 'all' && options.only !== target.category) continue

    const rows = await selectAllRows(
      supabase,
      target.table,
      target.select,
      (query) => target.filter(query),
    )

    const publicBaseUrl = ensureRequiredEnv(target.publicBaseEnv)

    for (const row of rows) {
      const rawValue = row[target.column]
      if (typeof rawValue !== 'string' || !rawValue.trim()) continue
      const sourceUrl = rawValue.trim()
      const sourceObjectPath = parseSupabaseStorageObjectPath(sourceUrl, target.sourceBucket)
      if (!sourceObjectPath) continue

      const targetExtension = getFileExtension(sourceObjectPath, null)
      const targetObjectPath = normalizePath(target.buildTargetObjectPath(row, targetExtension))
      if (!targetObjectPath) {
        throw new Error(`${target.key} icin hedef object path uretilemedi. row=${row.id}`)
      }

      jobs.push({
        key: target.key,
        table: target.table,
        rowId: row.id,
        column: target.column,
        sourceBucket: target.sourceBucket,
        targetBucket: target.targetBucket,
        sourceUrl,
        sourceObjectPath,
        targetObjectPath,
        targetUrl: buildPublicUrl(publicBaseUrl, targetObjectPath),
      })
    }
  }

  if (options.limit) {
    return jobs.slice(0, options.limit)
  }

  return jobs
}

async function updateRowUrl(supabase, job) {
  if (job.key === 'users.avatar_url') {
    const { error } = await supabase.rpc('rewrite_legacy_user_avatar_url', {
      p_user_id: job.rowId,
      p_avatar_url: job.targetUrl,
    })
    if (error) {
      throw error
    }
    return
  }

  const { error } = await supabase
    .from(job.table)
    .update({ [job.column]: job.targetUrl })
    .eq('id', job.rowId)

  if (error) {
    throw error
  }
}

function printDryRunSummary(jobs) {
  const grouped = new Map()

  for (const job of jobs) {
    grouped.set(job.key, (grouped.get(job.key) || 0) + 1)
  }

  for (const [key, count] of grouped.entries()) {
    console.log(`[dry-run] ${key} :: ${count}`)
  }

  for (const sample of jobs.slice(0, 20)) {
    console.log(`[dry-run] ${sample.key} :: ${sample.sourceObjectPath} -> ${sample.targetObjectPath}`)
  }
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
  console.log(`[info] kapsam=${options.only}`)
  if (options.limit) {
    console.log(`[info] limit=${options.limit}`)
  }

  const jobs = await collectMigrationJobs(supabase, options)
  if (jobs.length === 0) {
    console.log('[done] Tasinacak legacy avatar/kapak kaydi bulunamadi.')
    return
  }

  const bucketSet = new Set(jobs.map((job) => job.targetBucket))
  for (const bucket of bucketSet) {
    ensureR2EnabledAndBucketReady(bucket, options.apply)
  }

  console.log(`[info] candidate record count=${jobs.length}`)

  if (!options.apply) {
    printDryRunSummary(jobs)
    console.log('[done] dry-run tamamlandi. Gercek tasima icin: npm run r2:migrate:legacy-media:apply')
    return
  }

  let uploaded = 0
  let updated = 0
  const failed = []

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i]
    const progress = `${i + 1}/${jobs.length}`
    let tmpPath = null

    try {
      const payload = await fetchBufferFromUrl(job.sourceUrl, `download:${job.key}:${job.rowId}`)
      const extension = getFileExtension(job.sourceObjectPath, payload.contentType)
      const effectiveTargetObjectPath = job.targetObjectPath.replace(/\.[^.]+$/, `.${extension}`)
      const effectiveTargetUrl = job.targetUrl.replace(/\.[^.]+$/, `.${extension}`)

      tmpPath = writeTempFile(payload.buffer, effectiveTargetObjectPath)
      deleteTargetVariants(job.targetBucket, effectiveTargetObjectPath)
      uploadToR2(job.targetBucket, effectiveTargetObjectPath, tmpPath, payload.contentType)
      uploaded += 1

      await updateRowUrl(supabase, { ...job, targetUrl: effectiveTargetUrl })
      updated += 1

      console.log(`[ok] ${progress} ${job.key} ${job.rowId}`)
    } catch (error) {
      const message = formatErrorMessage(error)
      failed.push({ job, message })
      console.error(`[fail] ${progress} ${job.key} ${job.rowId} :: ${message}`)
    } finally {
      if (tmpPath && fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath)
      }
    }
  }

  console.log('\n--- Summary ---')
  console.log(`toplam aday: ${jobs.length}`)
  console.log(`basarili upload: ${uploaded}`)
  console.log(`basarili update: ${updated}`)
  console.log(`failed operations: ${failed.length}`)

  if (failed.length > 0) {
    console.log('\n--- Error Samples ---')
    for (const item of failed.slice(0, 15)) {
      console.log(`${item.job.key} ${item.job.rowId} :: ${item.message}`)
    }
    process.exitCode = 1
    return
  }

  console.log('[done] Legacy avatar and manga cover records moved to Cloudflare R2.')
}

main().catch((error) => {
  const message = formatErrorMessage(error)
  console.error(`[r2:migrate:legacy-media] ERROR: ${message}`)
  process.exit(1)
})
