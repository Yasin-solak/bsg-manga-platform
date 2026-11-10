import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function blockAfter(source, marker, endMarker = '\n\n') {
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `${marker} bulunamadi`)
  const end = source.indexOf(endMarker, start + marker.length)
  return source.slice(start, end === -1 ? undefined : end)
}

const migration = read('supabase/migrations/20260520235901_advisor_performance_policy_cleanup.sql')

assert.match(migration, /drop policy if exists community_posts_insert_self on public\.community_posts;/)
assert.match(migration, /drop policy if exists community_posts_insert_fansub_staff on public\.community_posts;/)

const insertPolicy = blockAfter(migration, 'create policy community_posts_insert_authenticated_pending')
assert.match(insertPolicy, /for insert/)
assert.match(insertPolicy, /to authenticated/)
assert.match(insertPolicy, /public\.can_manage_moderation_state\(\)/)
assert.match(insertPolicy, /author_id = public\.current_public_user_id\(\)/)
assert.match(insertPolicy, /status = 'pending'/)
assert.match(insertPolicy, /approved_at is null/)
assert.match(insertPolicy, /rejected_at is null/)
assert.match(insertPolicy, /lower\(coalesce\(btrim\(category\), ''::text\)\) <> 'duyuru'::text/)
assert.match(insertPolicy, /related_fansub_id is null/)
assert.match(insertPolicy, /public\.is_fansub_staff\(related_fansub_id\)/)

for (const redundantIndex of [
  'community_post_poll_options_poll_idx',
  'fansub_identity_tags_fansub_idx',
  'premium_monthly_packages_month_key_idx',
  'site_announcements_active_idx',
  'user_manga_list_items_list_position_idx',
]) {
  assert.match(migration, new RegExp(`drop index if exists public\\.${redundantIndex};`))
}

for (const retainedIndex of [
  'community_post_poll_options_poll_id_position_key',
  'fansub_identity_tags_fansub_id_unique',
  'premium_monthly_packages_month_key_key',
  'site_announcements_home_idx',
  'user_manga_list_items_list_id_position_key',
]) {
  assert.ok(!migration.includes(`drop index if exists public.${retainedIndex};`), `${retainedIndex} korunmali`)
}

assert.match(migration, /notify pgrst, 'reload schema';/)

console.log('PASS Supabase Advisor performance policy cleanup contract kept')
