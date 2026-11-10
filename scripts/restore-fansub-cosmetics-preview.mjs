import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

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

async function main() {
  const cwd = process.cwd()
  loadProjectEnv({ cwd, includeAdmin: true })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const backupPathInput = readOption('--backup')

  if (!supabaseUrl || !serviceRoleKey) {
    fail(`Eksik degisken: SUPABASE_URL/VITE_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli. ${getAdminEnvSetupHint()}`)
  }

  if (!backupPathInput) {
    fail('--backup <backup-file> is required for rollback.')
  }

  const backupPath = path.isAbsolute(backupPathInput)
    ? backupPathInput
    : path.join(cwd, backupPathInput)

  if (!fs.existsSync(backupPath)) {
    fail(`Backup file not found: ${backupPath}`)
  }

  const payload = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
  const fansub = payload.fansub
  const existingInventoryRows = payload.existingInventoryRows || []
  const existingBadgeRows = payload.existingBadgeRows || []
  const appliedTargets = payload.appliedTargets || {}

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (Array.isArray(appliedTargets.addedInventoryItemIds) && appliedTargets.addedInventoryItemIds.length > 0) {
    const { error } = await supabase
      .from('fansub_inventory')
      .delete()
      .eq('fansub_id', fansub.id)
      .in('store_item_id', appliedTargets.addedInventoryItemIds)

    if (error) throw error
  }

  if (Array.isArray(appliedTargets.eligibleBadgeIds) && appliedTargets.eligibleBadgeIds.length > 0) {
    const { error: badgeResetError } = await supabase
      .from('fansub_badges')
      .update({ is_displayed: false, display_order: 0 })
      .eq('fansub_id', fansub.id)
      .in('badge_id', appliedTargets.eligibleBadgeIds)

    if (badgeResetError) throw badgeResetError
  }

  for (const badgeRow of existingBadgeRows) {
    const { error } = await supabase
      .from('fansub_badges')
      .upsert({
        fansub_id: fansub.id,
        badge_id: badgeRow.badge_id,
        obtained_at: badgeRow.obtained_at,
        is_displayed: badgeRow.is_displayed,
        display_order: badgeRow.display_order,
      }, {
        onConflict: 'fansub_id,badge_id',
      })

    if (error) throw error
  }

  if (Array.isArray(appliedTargets.addedBadgeIds) && appliedTargets.addedBadgeIds.length > 0) {
    const { error } = await supabase
      .from('fansub_badges')
      .delete()
      .eq('fansub_id', fansub.id)
      .in('badge_id', appliedTargets.addedBadgeIds)

    if (error) throw error
  }

  const { error: fansubUpdateError } = await supabase
    .from('fansubs')
    .update({
      frame_type: fansub.frameType,
      active_frame_id: fansub.activeFrameId,
      active_profile_effect_id: fansub.activeProfileEffectId,
      active_background_id: fansub.activeBackgroundId,
      active_pattern_id: fansub.activePatternId,
    })
    .eq('id', fansub.id)

  if (fansubUpdateError) throw fansubUpdateError

  console.log('Fansub kozmetik onizleme geri alma tamamlandi.')
  console.log(`Fansub: ${fansub.name} (${fansub.id})`)
  console.log(`Geri alinan yedek: ${backupPath}`)
  console.log(`Old inventory record count: ${existingInventoryRows.length}`)
  console.log(`Old badge record count: ${existingBadgeRows.length}`)
}

main().catch((error) => {
  console.error('Fansub cosmetic preview rollback error:')
  console.error(error)
  process.exit(1)
})
