import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

const BUCKET = 'store-assets'

const FRAME_OVERLAY_MAP = {
  avatarframe1: 'avatarframe1.webp',
  avatarframe2: 'avatarframe2.webp',
  avatarframe3: 'avatarframe3.webp',
  avatarframe4: 'avatarframe4.webp',
}

const BACKGROUND_FILE_MAP = {
  'bg-city-glow': 'bg-city-glow.png',
  'bg-night-alley': 'bg-night-alley.png',
  'bg-sky-temple': 'bg-sky-temple.png',
  'bg-dragon-hall': 'bg-dragon-hall.png',
  'anime-neon-loop': 'anime-neon-loop.webm',
}

const ASSET_SOURCES = [
  {
    sourceDir: 'src/assets/frames',
    targetPrefix: 'frames',
    includeExtensions: new Set(['.png', '.webp', '.gif']),
  },
  {
    sourceDir: 'public/backgrounds',
    targetPrefix: 'backgrounds',
    includeExtensions: new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm']),
  },
  {
    sourceDir: 'public/badges',
    targetPrefix: 'badges',
    includeExtensions: new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']),
  },
]

function boolFromEnv(value) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function fileExt(fileName) {
  return path.extname(fileName).toLowerCase()
}

function getContentType(fileName) {
  const ext = fileExt(fileName)
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  }
  return map[ext] || 'application/octet-stream'
}

function listFilesFromSource(projectRoot, source) {
  const absDir = path.join(projectRoot, source.sourceDir)
  if (!fs.existsSync(absDir)) return []

  const entries = fs.readdirSync(absDir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue

    const ext = fileExt(entry.name)
    if (!source.includeExtensions.has(ext)) continue

    const absPath = path.join(absDir, entry.name)
    const objectPath = `${source.targetPrefix}/${entry.name}`
    files.push({
      absPath,
      objectPath,
      fileName: entry.name,
      contentType: getContentType(entry.name),
    })
  }
  return files
}

function storeAssetRef(objectPath) {
  return `store-assets://${objectPath}`
}

function extractBadgeFilename(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null
  if (imageUrl.startsWith('store-assets://badges/')) {
    return imageUrl.slice('store-assets://badges/'.length)
  }
  const marker = '/badges/'
  const idx = imageUrl.lastIndexOf(marker)
  if (idx === -1) return null
  return imageUrl.slice(idx + marker.length).split('?')[0]
}

async function uploadAssets(supabase, files, dryRun) {
  let uploaded = 0
  for (const file of files) {
    if (dryRun) {
      console.log(`[DRY-RUN] Upload: ${file.objectPath}`)
      uploaded += 1
      continue
    }

    const buffer = fs.readFileSync(file.absPath)
    const { error } = await supabase.storage.from(BUCKET).upload(file.objectPath, buffer, {
      upsert: true,
      cacheControl: '3600',
      contentType: file.contentType,
    })

    if (error) throw error

    uploaded += 1
    console.log(`[OK] Upload: ${file.objectPath}`)
  }
  return uploaded
}

async function syncBackgroundRefs(supabase, backgroundFiles, dryRun) {
  const fileSet = new Set(backgroundFiles.map((f) => f.fileName))
  const { data, error } = await supabase
    .from('store_items')
    .select('id, identifier, type, custom_asset_url')
    .eq('type', 'background')

  if (error) throw error

  let updated = 0
  for (const row of data || []) {
    const mappedFile = BACKGROUND_FILE_MAP[row.identifier]
    if (!mappedFile || !fileSet.has(mappedFile)) continue

    const nextRef = storeAssetRef(`backgrounds/${mappedFile}`)
    if (row.custom_asset_url === nextRef) continue

    if (dryRun) {
      console.log(`[DRY-RUN] Background ref guncellenecek: ${row.identifier} -> ${nextRef}`)
      updated += 1
      continue
    }

    const { error: updateError } = await supabase
      .from('store_items')
      .update({ custom_asset_url: nextRef })
      .eq('id', row.id)

    if (updateError) throw updateError

    updated += 1
    console.log(`[OK] Background ref guncellendi: ${row.identifier}`)
  }

  return updated
}

async function syncFrameRefs(supabase, frameFiles, dryRun) {
  const fileSet = new Set(frameFiles.map((f) => f.fileName))
  const frameIds = Object.keys(FRAME_OVERLAY_MAP)

  const { data, error } = await supabase
    .from('store_items')
    .select('id, identifier, type, custom_asset_url')
    .eq('type', 'frame')
    .in('identifier', frameIds)

  if (error) throw error

  let updated = 0
  for (const row of data || []) {
    const mappedFile = FRAME_OVERLAY_MAP[row.identifier]
    if (!mappedFile || !fileSet.has(mappedFile)) continue

    const nextRef = storeAssetRef(`frames/${mappedFile}`)
    if (row.custom_asset_url === nextRef) continue

    if (dryRun) {
      console.log(`[DRY-RUN] Frame ref guncellenecek: ${row.identifier} -> ${nextRef}`)
      updated += 1
      continue
    }

    const { error: updateError } = await supabase
      .from('store_items')
      .update({ custom_asset_url: nextRef })
      .eq('id', row.id)

    if (updateError) throw updateError

    updated += 1
    console.log(`[OK] Frame ref guncellendi: ${row.identifier}`)
  }

  return updated
}

async function syncBadgeRefs(supabase, badgeFiles, dryRun) {
  const fileSet = new Set(badgeFiles.map((f) => f.fileName))
  const { data, error } = await supabase
    .from('badges')
    .select('id, name, image_url')

  if (error) throw error

  let updated = 0
  for (const row of data || []) {
    const fileName = extractBadgeFilename(row.image_url)
    if (!fileName || !fileSet.has(fileName)) continue

    const nextRef = storeAssetRef(`badges/${fileName}`)
    if (row.image_url === nextRef) continue

    if (dryRun) {
      console.log(`[DRY-RUN] Badge ref guncellenecek: ${row.name} -> ${nextRef}`)
      updated += 1
      continue
    }

    const { error: updateError } = await supabase
      .from('badges')
      .update({ image_url: nextRef })
      .eq('id', row.id)

    if (updateError) throw updateError

    updated += 1
    console.log(`[OK] Badge ref guncellendi: ${row.name}`)
  }

  return updated
}

async function main() {
  const cwd = process.cwd()
  loadProjectEnv({ cwd, includeAdmin: true })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const dryRun = boolFromEnv(process.env.STORE_ASSET_SEED_DRY_RUN)

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`Eksik degisken: SUPABASE_URL (veya VITE_SUPABASE_URL) ve SUPABASE_SERVICE_ROLE_KEY gerekli. ${getAdminEnvSetupHint()}`)
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const fileGroups = ASSET_SOURCES.map((source) => ({
    source,
    files: listFilesFromSource(cwd, source),
  }))

  const allFiles = fileGroups.flatMap((g) => g.files)
  if (allFiles.length === 0) {
    console.log('No file to upload. Stopping.')
    return
  }

  const uploadedCount = await uploadAssets(supabase, allFiles, dryRun)

  const frameFiles = fileGroups.find((g) => g.source.targetPrefix === 'frames')?.files || []
  const backgroundFiles = fileGroups.find((g) => g.source.targetPrefix === 'backgrounds')?.files || []
  const badgeFiles = fileGroups.find((g) => g.source.targetPrefix === 'badges')?.files || []

  const frameRefUpdated = await syncFrameRefs(supabase, frameFiles, dryRun)
  const backgroundRefUpdated = await syncBackgroundRefs(supabase, backgroundFiles, dryRun)
  const badgeRefUpdated = await syncBadgeRefs(supabase, badgeFiles, dryRun)

  console.log('\n=== Summary ===')
  console.log(`Upload edilen dosya: ${uploadedCount}`)
  console.log(`Frame ref guncelleme: ${frameRefUpdated}`)
  console.log(`Background ref guncelleme: ${backgroundRefUpdated}`)
  console.log(`Badge ref guncelleme: ${badgeRefUpdated}`)
  if (dryRun) {
    console.log('\nRan in DRY-RUN mode. No DB changes applied.')
  }
}

main().catch((err) => {
  console.error('\nStore asset seed script error:')
  console.error(err)
  process.exit(1)
})
