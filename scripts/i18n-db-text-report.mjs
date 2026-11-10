import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

/**
 * READ-ONLY report: lists database system texts with no English equivalent
 * (dictionary: src/i18n/messages/en, DB: i18n_text_overrides).
 * User content (series, fansub, comment, list) is out of scope.
 *
 * Run: node scripts/i18n-db-text-report.mjs [--json]
 * Requires: SUPABASE_SERVICE_ROLE_KEY (admin env). Not tied to CI.
 */
const SOURCES = [
  ['badges', ['name', 'description']],
  ['feature_flags', ['label', 'description']],
  ['fansub_boost_capability_policies', ['label', 'summary', 'detail', 'placement_hint']],
  ['fansub_boost_plans', ['name', 'description']],
  ['fansub_identity_badge_catalog', ['label']],
  ['fansub_reward_tasks', ['title', 'description']],
  ['fansub_reward_view_tiers', ['label']],
  ['murek_items', ['name', 'description']],
  ['name_effects', ['name', 'description']],
  ['quest_events', ['title', 'description']],
  ['quests', ['title', 'description']],
  ['reading_streak_reward_rules', ['title', 'description']],
  ['shop_campaigns', ['name']],
  ['shop_discounts', ['name']],
  ['shop_products', ['title', 'subtitle', 'description']],
  ['shop_seasons', ['name', 'description']],
  ['site_announcements', ['title', 'body', 'action_label']],
  ['site_events', ['name', 'summary']],
  ['store_items', ['name', 'description']],
  ['storefront_collections', ['name', 'description']],
  ['user_level_thresholds', ['title']],
  ['user_reward_tasks', ['title', 'description']],
]

function loadDictionaryKeys() {
  const dir = path.join(process.cwd(), 'src/i18n/messages/en')
  const keys = new Set()
  for (const file of readdirSync(dir)) {
    const source = readFileSync(path.join(dir, file), 'utf8')
    for (const match of source.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*'/gm)) keys.add(match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'))
  }
  return keys
}

async function main() {
  loadProjectEnv({ cwd: process.cwd(), includeAdmin: true })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error(`Env eksik. ${getAdminEnvSetupHint()}`)
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const known = loadDictionaryKeys()
  const { data: overrides } = await supabase.from('i18n_text_overrides').select('source_text')
  for (const row of overrides ?? []) known.add(row.source_text)

  const report = {}
  for (const [table, columns] of SOURCES) {
    const { data, error } = await supabase.from(table).select(columns.join(','))
    if (error) {
      report[table] = { error: error.message }
      continue
    }
    const missing = new Set()
    let total = 0
    for (const row of data ?? []) {
      for (const column of columns) {
        const text = typeof row[column] === 'string' ? row[column].trim() : ''
        if (!text) continue
        total += 1
        if (!known.has(text)) missing.add(text)
      }
    }
    report[table] = { total, missing: [...missing] }
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  let count = 0
  for (const [table, row] of Object.entries(report)) {
    if (row.error) {
      console.log(`! ${table}: ${row.error}`)
      continue
    }
    count += row.missing.length
    console.log(`${row.missing.length ? '-' : '+'} ${table}: ${row.missing.length} eksik / ${row.total}`)
    for (const text of row.missing) console.log(`    ${text.replace(/\s+/g, ' ').slice(0, 160)}`)
  }
  console.log(`\nToplam eksik: ${count}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
