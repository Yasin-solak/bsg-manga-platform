import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

const RARITY_ORDER = {
  legendary: 4,
  epic: 3,
  rare: 2,
  common: 1,
}

function readOption(name) {
  const prefix = `${name}=`
  const directIndex = process.argv.indexOf(name)
  if (directIndex !== -1) {
    return process.argv[directIndex + 1] || ''
  }

  const inline = process.argv.find((entry) => entry.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : ''
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'fansub'
}

function buildTimestamp() {
  const now = new Date()
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ]
  return parts.join('')
}

function sortBadgesForPreview(items) {
  return [...items].sort((left, right) => {
    const rarityDiff = (RARITY_ORDER[right.rarity] || 0) - (RARITY_ORDER[left.rarity] || 0)
    if (rarityDiff !== 0) return rarityDiff
    return String(left.name || '').localeCompare(String(right.name || ''), 'tr')
  })
}

async function resolveFansub(supabase, identity) {
  const normalized = identity.trim()
  if (!normalized) fail('Fansub adi veya slug zorunludur.')

  const selectClause = 'id, name, slug, frame_type, active_frame_id, active_profile_effect_id, active_background_id, active_pattern_id'
  const exactSlug = await supabase
    .from('fansubs')
    .select(selectClause)
    .ilike('slug', normalized)
    .limit(2)

  if (exactSlug.error) throw exactSlug.error
  if ((exactSlug.data || []).length === 1) return exactSlug.data[0]
  if ((exactSlug.data || []).length > 1) {
    fail(`Birden fazla fansub slug ile eslesti: ${normalized}`)
  }

  const exactName = await supabase
    .from('fansubs')
    .select(selectClause)
    .ilike('name', normalized)
    .limit(2)

  if (exactName.error) throw exactName.error
  if ((exactName.data || []).length === 1) return exactName.data[0]
  if ((exactName.data || []).length > 1) {
    fail(`Birden fazla fansub ad ile eslesti: ${normalized}`)
  }

  const fuzzyPattern = `%${normalized.replace(/\s+/g, '%')}%`
  const fuzzyMatches = await supabase
    .from('fansubs')
    .select(selectClause)
    .or(`name.ilike.${fuzzyPattern},slug.ilike.${fuzzyPattern}`)
    .limit(5)

  if (fuzzyMatches.error) throw fuzzyMatches.error
  if ((fuzzyMatches.data || []).length === 1) return fuzzyMatches.data[0]
  if ((fuzzyMatches.data || []).length > 1) {
    const candidates = fuzzyMatches.data.map((row) => `${row.name} (${row.slug})`).join(', ')
    fail(`Fansub did not narrow to one candidate. Matches: ${candidates}`)
  }

  fail(`Fansub bulunamadi: ${normalized}`)
}

async function loadTargetCosmetics(supabase) {
  const { data: storeItems, error: storeItemsError } = await supabase
    .from('store_items')
    .select('id, name, identifier, type, purchase_count, is_active')
    .in('type', ['frame', 'profile_effect'])
    .eq('is_active', true)

  if (storeItemsError) throw storeItemsError

  const { data: badges, error: badgesError } = await supabase
    .from('badges')
    .select('id, name, rarity, target_type, is_active')
    .in('target_type', ['fansub', 'both'])
    .eq('is_active', true)

  if (badgesError) throw badgesError

  const sortedItems = [...(storeItems || [])].sort((left, right) => {
    const typeDiff = String(left.type).localeCompare(String(right.type))
    if (typeDiff !== 0) return typeDiff
    const purchaseDiff = Number(right.purchase_count || 0) - Number(left.purchase_count || 0)
    if (purchaseDiff !== 0) return purchaseDiff
    return String(left.name || '').localeCompare(String(right.name || ''), 'tr')
  })

  return {
    frames: sortedItems.filter((item) => item.type === 'frame'),
    profileEffects: sortedItems.filter((item) => item.type === 'profile_effect'),
    badges: sortBadgesForPreview(badges || []),
  }
}

async function loadExistingState(supabase, fansubId) {
  const [{ data: inventoryRows, error: inventoryError }, { data: badgeRows, error: badgeError }] = await Promise.all([
    supabase
      .from('fansub_inventory')
      .select('store_item_id, acquired_at, acquired_by')
      .eq('fansub_id', fansubId),
    supabase
      .from('fansub_badges')
      .select('badge_id, is_displayed, display_order, obtained_at')
      .eq('fansub_id', fansubId),
  ])

  if (inventoryError) throw inventoryError
  if (badgeError) throw badgeError

  return {
    inventoryRows: inventoryRows || [],
    badgeRows: badgeRows || [],
  }
}

function buildDisplayBadgeIds(existingBadgeRows, eligibleBadges) {
  const preserved = [...existingBadgeRows]
    .filter((row) => row.is_displayed === true)
    .sort((left, right) => Number(left.display_order || 0) - Number(right.display_order || 0))
    .map((row) => row.badge_id)

  const next = [...preserved]
  for (const badge of eligibleBadges) {
    if (next.includes(badge.id)) continue
    next.push(badge.id)
    if (next.length >= 3) break
  }

  return next.slice(0, 3)
}

async function main() {
  const cwd = process.cwd()
  loadProjectEnv({ cwd, includeAdmin: true })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const fansubIdentity = readOption('--fansub') || 'bsg manga121212'

  if (!supabaseUrl || !serviceRoleKey) {
    fail(`Eksik degisken: SUPABASE_URL/VITE_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli. ${getAdminEnvSetupHint()}`)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const fansub = await resolveFansub(supabase, fansubIdentity)
  const target = await loadTargetCosmetics(supabase)
  const existing = await loadExistingState(supabase, fansub.id)

  const existingInventoryIds = new Set(existing.inventoryRows.map((row) => row.store_item_id))
  const existingBadgeIds = new Set(existing.badgeRows.map((row) => row.badge_id))
  const targetInventoryItems = [...target.frames, ...target.profileEffects]
  const inventoryToAdd = targetInventoryItems.filter((item) => !existingInventoryIds.has(item.id))
  const badgesToAdd = target.badges.filter((badge) => !existingBadgeIds.has(badge.id))
  const badgeDisplayIds = buildDisplayBadgeIds(existing.badgeRows, target.badges)

  const backupDir = path.join(cwd, 'tmp', 'fansub-cosmetics-backups')
  ensureDir(backupDir)
  const backupPath = path.join(backupDir, `${slugify(fansub.slug || fansub.name)}-${buildTimestamp()}.json`)

  const backupPayload = {
    createdAt: new Date().toISOString(),
    fansub: {
      id: fansub.id,
      name: fansub.name,
      slug: fansub.slug,
      frameType: fansub.frame_type,
      activeFrameId: fansub.active_frame_id,
      activeProfileEffectId: fansub.active_profile_effect_id,
      activeBackgroundId: fansub.active_background_id,
      activePatternId: fansub.active_pattern_id,
    },
    existingInventoryRows: existing.inventoryRows,
    existingBadgeRows: existing.badgeRows,
    appliedTargets: {
      frameItemIds: target.frames.map((item) => item.id),
      profileEffectItemIds: target.profileEffects.map((item) => item.id),
      eligibleBadgeIds: target.badges.map((badge) => badge.id),
      addedInventoryItemIds: inventoryToAdd.map((item) => item.id),
      addedBadgeIds: badgesToAdd.map((badge) => badge.id),
    },
  }
  fs.writeFileSync(backupPath, `${JSON.stringify(backupPayload, null, 2)}\n`, 'utf8')

  if (inventoryToAdd.length > 0) {
    const { error } = await supabase
      .from('fansub_inventory')
      .insert(inventoryToAdd.map((item) => ({
        fansub_id: fansub.id,
        store_item_id: item.id,
      })))

    if (error) throw error
  }

  if (badgesToAdd.length > 0) {
    const { error } = await supabase
      .from('fansub_badges')
      .insert(badgesToAdd.map((badge) => ({
        fansub_id: fansub.id,
        badge_id: badge.id,
        is_displayed: false,
        display_order: 0,
      })))

    if (error) throw error
  }

  const frameToActivate = fansub.active_frame_id || target.frames[0]?.id || null
  const frameTypeToActivate = fansub.active_frame_id
    ? fansub.frame_type
    : (target.frames[0]?.identifier || fansub.frame_type || null)
  const profileEffectToActivate = fansub.active_profile_effect_id || target.profileEffects[0]?.id || null

  const { error: fansubUpdateError } = await supabase
    .from('fansubs')
    .update({
      active_frame_id: frameToActivate,
      frame_type: frameTypeToActivate,
      active_profile_effect_id: profileEffectToActivate,
    })
    .eq('id', fansub.id)

  if (fansubUpdateError) throw fansubUpdateError

  const allBadgeIds = target.badges.map((badge) => badge.id)
  if (allBadgeIds.length > 0) {
    const { error: badgeResetError } = await supabase
      .from('fansub_badges')
      .update({ is_displayed: false, display_order: 0 })
      .eq('fansub_id', fansub.id)
      .in('badge_id', allBadgeIds)

    if (badgeResetError) throw badgeResetError

    for (let index = 0; index < badgeDisplayIds.length; index += 1) {
      const badgeId = badgeDisplayIds[index]
      const { error: badgeDisplayError } = await supabase
        .from('fansub_badges')
        .update({ is_displayed: true, display_order: index + 1 })
        .eq('fansub_id', fansub.id)
        .eq('badge_id', badgeId)

      if (badgeDisplayError) throw badgeDisplayError
    }
  }

  console.log('Fansub cosmetic preview upload finished.')
  console.log(`Fansub: ${fansub.name} (${fansub.id})`)
  console.log(`Eklenen cerceve/profil efekti envanteri: ${inventoryToAdd.length}`)
  console.log(`Badges added: ${badgesToAdd.length}`)
  console.log(`Backup file: ${backupPath}`)
}

main().catch((error) => {
  console.error('Fansub cosmetic preview upload error:')
  console.error(error)
  process.exit(1)
})
