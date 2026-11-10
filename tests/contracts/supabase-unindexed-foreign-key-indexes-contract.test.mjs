import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const migration = read('supabase/migrations/20260520235903_unindexed_foreign_key_indexes.sql')
const createIndexCount = (migration.match(/create index if not exists /g) ?? []).length

assert.equal(createIndexCount, 87, 'all missing FK indexes must be in the migration scope')

for (const statement of [
  'create index if not exists idx_activity_events_manga_id_fk on public.activity_events (manga_id);',
  'create index if not exists idx_community_posts_related_manga_id_fk on public.community_posts (related_manga_id);',
  'create index if not exists idx_fansub_supporter_assets_current_revision_id_fk on public.fansub_supporter_assets (current_revision_id);',
  'create index if not exists idx_release_schedule_reminders_last_notified_chapter_id_fk on public.release_schedule_reminders (last_notified_chapter_id);',
  'create index if not exists idx_user_premium_reward_events_runtime_config_id_fk on public.user_premium_reward_events (runtime_config_id);',
  'create index if not exists idx_users_active_profile_effect_id_fk on public.users (active_profile_effect_id);',
]) {
  assert.ok(migration.includes(statement), `${statement} bulunmali`)
}

assert.ok(!migration.includes('create index concurrently'), 'concurrently must not be used, for apply_migration transaction compatibility')

console.log('PASS unindexed FK index cleanup contract kept')
