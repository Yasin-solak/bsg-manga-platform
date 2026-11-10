/**
 * Release schedule visibility contract.
 *
 * Protected decisions:
 *
 * 1. `list_public_release_schedule` must be SECURITY DEFINER. As INVOKER the
 * early access gate in the chapters_select_public policy
 * (app_private.can_current_user_access_chapter) kicked in and hid every
 * "not yet public" chapter from the caller, which is ALL the schedule
 * would show. For anon the result was always empty; measured with live
 * data (anon saw 0 with 14 records).
 * 2. Being definer must not widen the visibility surface: WHERE still wants is_active +
 * is_approved for chapter and manga, plus an active fansub. Only
 * SCHEDULE info returns; page content is not in this RPC, so the early access
 * gate is not pierced.
 * 3. The moment returned must be the PUBLIC moment: publish_at is returned not raw but
 * via `app_private.chapter_public_unlock_at`. Otherwise
 * Nitro's early time would leak to everyone.
 * 4. The schedule badge and Schedule page read from the SAME source. The badge used to
 * query the `chapters` table directly; due to the same RLS it stayed at 0 for
 * signed-out users and the two surfaces gave different answers.
 * 5. The badge counts UNIQUE manga+chapter, not rows: several fansubs can upload the same
 * chapter (chapters uniqueness is manga_id+chapter_number+fansub_id).
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')

const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/^\s*--.*$/gm, '')

const migration = stripComments(read('supabase/migrations/20260820170000_release_schedule_definer.sql'))
const feedService = stripComments(read('src/services/latestChapterFeedService.ts'))

// 1. Definer.
assert.match(
  migration,
  /create or replace function public\.list_public_release_schedule[\s\S]*?security definer/i,
  'list_public_release_schedule must be SECURITY DEFINER; as INVOKER the schedule is always empty for anon users.',
)

// 2. Gorunurluk yuzeyi daralmis kalmali.
for (const predicate of [
  'c.is_active = true',
  'c.is_approved = true',
  'm.is_active = true',
  'm.is_approved = true',
  "coalesce(f.is_active, true) = true",
]) {
  assert.ok(
    migration.includes(predicate),
    `Definer fonksiyon "${predicate}" kosulunu birakamaz; birakirsa takvim yayimlanmamis icerigi listeler.`,
  )
}

// Page content must not return from this RPC.
assert.ok(
  !/\bc\.pages\b/.test(migration),
  'the schedule RPC must not return page content; as a definer it would pierce the early access gate.',
)

// 3. The public moment.
assert.match(
  migration,
  /app_private\.chapter_public_unlock_at\(c\.publish_at\) as publish_at/,
  'Takvim ham publish_at donduremez; Nitro erken saati disari sizar.',
)
assert.ok(
  !/\bc\.publish_at as publish_at\b/.test(migration),
  'publish_at dogrudan dondurulmemeli.',
)

// 4. The badge reads from the same source as the schedule.
assert.match(
  feedService,
  /countChaptersPublishedToday[\s\S]*?listPublicReleaseSchedule\(/,
  'the schedule badge must read via the same RPC as the Schedule page; a direct chapters query stays 0 for signed-out users due to early access RLS.',
)
assert.ok(
  !/countChaptersPublishedToday[\s\S]*?from\('chapters'\)/.test(feedService),
  'the badge must not query the chapters table directly.',
)

// 5. Unique manga+chapter.
assert.match(
  feedService,
  /countChaptersPublishedToday[\s\S]*?new Set<string>\(\)[\s\S]*?\$\{entry\.mangaId\}::\$\{entry\.chapterNumber\}/,
  'the badge must count unique manga+chapter, not rows; one chapter can come from several fansubs.',
)

console.log('PASS release schedule visibility contract kept')
