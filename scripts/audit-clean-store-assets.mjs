import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

const BUCKET = 'store-assets'
const STORE_ASSET_SCHEME = 'store-assets://'
const DEFAULT_RETRY_COUNT = 4
const DEFAULT_RETRY_WAIT_MS = 450

const TYPE_FOLDER_MAP = {
  frame: 'frames',
  badge: 'badges',
  pattern: 'patterns',
  background: 'backgrounds',
  premium: 'premium',
}

function normalizePath(value) {
  if (!value || typeof value !== 'string') return null

  let trimmed = value.trim()
  if (!trimmed) return null

  trimmed = trimmed.replace(/\\/g, '/').replace(/^\/+/, '')
  trimmed = trimmed.replace(/\/{2,}/g, '/')

  try {
    trimmed = decodeURIComponent(trimmed)
  } catch {
    // ignore decode error
  }

  return trimmed || null
}

function extractStoreAssetPath(value) {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith(STORE_ASSET_SCHEME)) {
    return normalizePath(trimmed.slice(STORE_ASSET_SCHEME.length))
  }

  if (trimmed.startsWith(`${BUCKET}/`)) {
    return normalizePath(trimmed.slice(BUCKET.length + 1))
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/store-assets\/(.+)$/i)
      if (match?.[1]) return normalizePath(match[1])
    } catch {
      // ignore parse error
    }
  }

  return null
}

function toStoreAssetRef(assetPath) {
  return `${STORE_ASSET_SCHEME}${assetPath}`
}

function getExpectedFolder(type) {
  return TYPE_FOLDER_MAP[type] || 'frames'
}

function fileNameFromPath(assetPath) {
  if (!assetPath) return null
  const parts = assetPath.split('/').filter(Boolean)
  if (parts.length === 0) return null
  return parts[parts.length - 1]
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry(taskName, fn, opts = {}) {
  const retryCount = opts.retryCount ?? DEFAULT_RETRY_COUNT
  const waitMs = opts.waitMs ?? DEFAULT_RETRY_WAIT_MS

  let lastError = null
  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= retryCount) break
      console.warn(`[retry] ${taskName} fail (${attempt}/${retryCount}), will retry...`)
      await delay(waitMs * attempt)
    }
  }

  throw lastError
}

async function listAllBucketObjects(supabase) {
  const files = new Set()
  const queue = ['']

  while (queue.length > 0) {
    const currentPrefix = queue.shift() || ''
    let offset = 0
    const pageLimit = 100

    while (true) {
      const { data, error } = await withRetry(
        `list:${currentPrefix || '<root>'}:${offset}`,
        () => supabase.storage.from(BUCKET).list(currentPrefix, {
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
          files.add(normalizePath(childPath))
        }
      }

      if (data.length < pageLimit) break
      offset += pageLimit
    }
  }

  return files
}

function parseArgs(argv) {
  const flags = new Set(argv.slice(2))
  return {
    apply: flags.has('--apply'),
    deleteOrphans: flags.has('--delete-orphans'),
  }
}

async function fetchStoreItems(supabase) {
  const { data, error } = await withRetry(
    'fetch-store-items',
    () => supabase
      .from('store_items')
      .select('id, name, type, custom_asset_url')
      .not('custom_asset_url', 'is', null),
  )

  if (error) throw error
  return data || []
}

async function fetchBadges(supabase) {
  const { data, error } = await withRetry(
    'fetch-badges',
    () => supabase
      .from('badges')
      .select('id, name, image_url'),
  )

  if (error) throw error
  return data || []
}

function buildStoreAuditPlan(rows, existingObjects, otherReferencedPaths) {
  const anomalies = {
    unsupportedRef: [],
    missingObject: [],
    nestedPrefix: [],
    folderMismatch: [],
  }

  const plannedUpdates = []

  for (const row of rows) {
    const rawRef = typeof row.custom_asset_url === 'string' ? row.custom_asset_url.trim() : ''
    if (!rawRef) continue

    const parsedPath = extractStoreAssetPath(rawRef)
    if (!parsedPath) {
      anomalies.unsupportedRef.push({
        id: row.id,
        type: row.type,
        name: row.name,
        ref: rawRef,
      })
      continue
    }

    const expectedFolder = getExpectedFolder(row.type)
    const reasons = []
    let desiredPath = parsedPath

    if (desiredPath.startsWith(`${BUCKET}/`)) {
      desiredPath = desiredPath.slice(BUCKET.length + 1)
      reasons.push('nested-prefix')
      anomalies.nestedPrefix.push({
        id: row.id,
        type: row.type,
        name: row.name,
        from: parsedPath,
        to: desiredPath,
      })
    }

    if (!desiredPath.startsWith(`${expectedFolder}/`)) {
      const filename = fileNameFromPath(desiredPath)
      if (filename) {
        const corrected = `${expectedFolder}/${filename}`
        reasons.push('folder-mismatch')
        anomalies.folderMismatch.push({
          id: row.id,
          type: row.type,
          name: row.name,
          from: desiredPath,
          to: corrected,
        })
        desiredPath = corrected
      }
    }

    const sourceExists = existingObjects.has(parsedPath)
    const targetExists = existingObjects.has(desiredPath)

    let missing = false
    let needsCopy = false

    if (parsedPath === desiredPath) {
      if (!sourceExists) missing = true
    } else if (!targetExists && sourceExists) {
      needsCopy = true
    } else if (!targetExists && !sourceExists) {
      missing = true
    }

    if (missing) {
      anomalies.missingObject.push({
        id: row.id,
        type: row.type,
        name: row.name,
        ref: rawRef,
        sourcePath: parsedPath,
        desiredPath,
      })
      continue
    }

    const canonicalRef = toStoreAssetRef(desiredPath)
    const needsRefUpdate = rawRef !== canonicalRef
    const pathChanged = parsedPath !== desiredPath
    if (!needsRefUpdate && !pathChanged) continue

    plannedUpdates.push({
      id: row.id,
      name: row.name,
      type: row.type,
      oldRef: rawRef,
      oldPath: parsedPath,
      newRef: canonicalRef,
      newPath: desiredPath,
      reasons,
      needsCopy,
      removableOldPath: pathChanged ? parsedPath : null,
    })
  }

  const projectedRefs = new Set(otherReferencedPaths)
  for (const row of rows) {
    const parsed = extractStoreAssetPath(row.custom_asset_url || '')
    if (parsed) projectedRefs.add(parsed)
  }
  for (const update of plannedUpdates) {
    projectedRefs.delete(update.oldPath)
    projectedRefs.add(update.newPath)
  }

  const removableOldPaths = new Set()
  for (const update of plannedUpdates) {
    if (!update.removableOldPath) continue
    if (!existingObjects.has(update.removableOldPath)) continue
    if (projectedRefs.has(update.removableOldPath)) continue
    removableOldPaths.add(update.removableOldPath)
  }

  return { anomalies, plannedUpdates, removableOldPaths, projectedRefs }
}

async function applyPlan(supabase, plan, options) {
  let copiedCount = 0
  let updatedCount = 0
  let removedMovedCount = 0
  let removedOrphanCount = 0

  for (const update of plan.plannedUpdates) {
    if (update.needsCopy) {
      const { error } = await withRetry(
        `copy:${update.oldPath}->${update.newPath}`,
        () => supabase.storage.from(BUCKET).copy(update.oldPath, update.newPath),
      )
      if (error) throw error
      copiedCount += 1
    }

    const { error: updateError } = await withRetry(
      `update-ref:${update.id}`,
      () => supabase
        .from('store_items')
        .update({ custom_asset_url: update.newRef })
        .eq('id', update.id),
    )
    if (updateError) throw updateError
    updatedCount += 1
  }

  if (plan.removableOldPaths.size > 0) {
    const removable = Array.from(plan.removableOldPaths)
    const { error } = await withRetry(
      `remove-moved:${removable.length}`,
      () => supabase.storage.from(BUCKET).remove(removable),
    )
    if (error) throw error
    removedMovedCount = removable.length
  }

  if (options.deleteOrphans && plan.orphanPaths.size > 0) {
    const orphanBatch = Array.from(plan.orphanPaths)
    const { error } = await withRetry(
      `remove-orphans:${orphanBatch.length}`,
      () => supabase.storage.from(BUCKET).remove(orphanBatch),
    )
    if (error) throw error
    removedOrphanCount = orphanBatch.length
  }

  return { copiedCount, updatedCount, removedMovedCount, removedOrphanCount }
}

async function main() {
  const args = parseArgs(process.argv)
  const projectRoot = process.cwd()

  loadProjectEnv({ cwd: projectRoot, includeAdmin: true })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(`VITE_SUPABASE_URL/SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik. ${getAdminEnvSetupHint()}`)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`[info] mod=${args.apply ? 'apply' : 'dry-run'}`)
  console.log('[info] scanning bucket...')
  const objectSet = await listAllBucketObjects(supabase)
  console.log(`[info] bucket object count: ${objectSet.size}`)

  const [storeRows, badgeRows] = await Promise.all([
    fetchStoreItems(supabase),
    fetchBadges(supabase),
  ])

  const badgeRefPaths = new Set()
  for (const badge of badgeRows) {
    const parsed = extractStoreAssetPath(badge.image_url || '')
    if (parsed) badgeRefPaths.add(parsed)
  }

  const planBase = buildStoreAuditPlan(storeRows, objectSet, badgeRefPaths)

  const allCurrentRefs = new Set(badgeRefPaths)
  for (const row of storeRows) {
    const parsed = extractStoreAssetPath(row.custom_asset_url || '')
    if (parsed) allCurrentRefs.add(parsed)
  }

  const orphanPaths = new Set()
  for (const objectPath of objectSet) {
    if (!objectPath) continue
    if (!planBase.projectedRefs.has(objectPath)) {
      orphanPaths.add(objectPath)
    }
  }

  const plan = {
    ...planBase,
    orphanPaths,
  }

  console.log('--- RAPOR ---')
  console.log(`store_item custom asset satiri: ${storeRows.length}`)
  console.log(`planlanan ref guncelleme: ${plan.plannedUpdates.length}`)
  console.log(`planlanan tasima(copy): ${plan.plannedUpdates.filter((x) => x.needsCopy).length}`)
  console.log(`tasima sonrasi silinebilir kaynak: ${plan.removableOldPaths.size}`)
  console.log(`yetim obje sayisi: ${plan.orphanPaths.size}`)
  console.log(`anomaly.unsupported_ref: ${plan.anomalies.unsupportedRef.length}`)
  console.log(`anomaly.missing_object: ${plan.anomalies.missingObject.length}`)
  console.log(`anomaly.nested_prefix: ${plan.anomalies.nestedPrefix.length}`)
  console.log(`anomaly.folder_mismatch: ${plan.anomalies.folderMismatch.length}`)

  const sampleUpdates = plan.plannedUpdates.slice(0, 8)
  for (const row of sampleUpdates) {
    console.log(`[plan] ${row.type} ${row.name} :: ${row.oldPath} -> ${row.newPath}`)
  }

  const sampleMissing = plan.anomalies.missingObject.slice(0, 8)
  for (const row of sampleMissing) {
    console.log(`[missing] ${row.type} ${row.name} :: source=${row.sourcePath} target=${row.desiredPath}`)
  }

  const sampleOrphans = Array.from(plan.orphanPaths).slice(0, 12)
  for (const orphan of sampleOrphans) {
    console.log(`[orphan] ${orphan}`)
  }

  if (!args.apply) {
    console.log('[done] dry-run tamamlandi. Uygulamak icin: node scripts/audit-clean-store-assets.mjs --apply')
    return
  }

  if (plan.anomalies.missingObject.length > 0) {
    console.warn('[warn] There are missing object errors. These rows will not be fixed automatically.')
  }

  const result = await applyPlan(supabase, plan, args)
  console.log('--- APPLY RESULT ---')
  console.log(`kopyalanan dosya: ${result.copiedCount}`)
  console.log(`guncellenen store ref: ${result.updatedCount}`)
  console.log(`old source deleted: ${result.removedMovedCount}`)
  console.log(`silinen yetim dosya: ${result.removedOrphanCount}`)
  console.log('[done] apply tamamlandi.')
}

main().catch((error) => {
  console.error('[fatal] audit-clean-store-assets error', error)
  process.exitCode = 1
})
